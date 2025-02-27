use crate::config::{FileExtensions, Watch as Config};
use crate::renderer::{EventChannel, EventLoop, UserEvent};
use anyhow::{Context as _, Result};
use notify::event::{CreateKind, EventKind as WatchEventKind, ModifyKind};
use notify::{recommended_watcher, RecommendedWatcher, RecursiveMode, Watcher as NotifyWatcher};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

pub struct PathFilter {
    extensions: FileExtensions,
    last_changed: HashMap<PathBuf, Instant>,
    debounce_throttle: Duration,
}

impl PathFilter {
    pub fn new(config: &Config) -> Self {
        let extensions = config.file_extensions().clone();
        let debounce_throttle = config.debounce_throttle();
        Self { extensions, last_changed: HashMap::new(), debounce_throttle }
    }

    fn debounce(&mut self, path: &Path) -> bool {
        let now = Instant::now();
        if let Some(last_changed) = self.last_changed.get_mut(path) {
            if now.duration_since(*last_changed) <= self.debounce_throttle {
                log::debug!("Debounced file-changed event for {:?}", path);
                return false;
            }
            *last_changed = now;
        } else {
            self.last_changed.insert(path.to_path_buf(), now);
        }
        true
    }

    fn should_retain(&mut self, path: &Path) -> bool {
        self.extensions.matches(path) && path.is_file() && self.debounce(path)
    }

    fn cleanup_debouncer(&mut self) {
        let before = self.last_changed.len();
        let now = Instant::now();
        self.last_changed
            .retain(|_, last_changed| now.duration_since(*last_changed) <= self.debounce_throttle);
        let expired = before - self.last_changed.len();
        if expired > 0 {
            log::debug!("Cleanup file-changed event debouncer. {} entries were expired", expired);
        }
    }
}

pub trait Watcher: Sized {
    fn new<E: EventLoop>(event_loop: &E, filter: PathFilter) -> Result<Self>;
    fn watch(&mut self, path: &Path) -> Result<()>;
    fn unwatch(&mut self, path: &Path) -> Result<()>;
}

fn find_path_to_watch(path: &Path) -> Result<(&Path, RecursiveMode)> {
    if path.is_dir() {
        Ok((path, RecursiveMode::Recursive))
    } else if path.exists() {
        Ok((path, RecursiveMode::NonRecursive))
    } else {
        let mut current = path;
        let mut mode = RecursiveMode::NonRecursive;
        while let Some(parent) = current.parent() {
            if parent.exists() {
                log::warn!(
                    "Path {:?} does not exist. Watching its parent directory {:?} instead",
                    path,
                    parent,
                );
                return Ok((parent, mode));
            }
            current = parent;
            mode = RecursiveMode::Recursive; // Recursive watch is necessary since depth is more than 1
        }
        anyhow::bail!("Could not watch path {:?} since it and all its parents don't exist", path)
    }
}

#[cfg(not(windows))]
fn should_handle_event(kind: WatchEventKind) -> bool {
    use notify::event::DataChange;
    matches!(
        kind,
        WatchEventKind::Create(CreateKind::File)
            | WatchEventKind::Modify(ModifyKind::Data(DataChange::Content | DataChange::Any))
    )
}

#[cfg(windows)]
fn should_handle_event(kind: WatchEventKind) -> bool {
    // ModifyKind::Data does not work on Windows because notify crate triggers all modify events
    // as ModifyKind::Any on Windows.
    matches!(
        kind,
        WatchEventKind::Create(CreateKind::File) | WatchEventKind::Modify(ModifyKind::Any)
    )
}

impl Watcher for RecommendedWatcher {
    fn new<E: EventLoop>(event_loop: &E, mut filter: PathFilter) -> Result<Self> {
        let channel = event_loop.create_channel();
        let watcher = recommended_watcher(move |res: notify::Result<notify::Event>| match res {
            Ok(event) if should_handle_event(event.kind) => {
                log::debug!("Caught filesystem event: {:?}", event);

                // XXX: Watcher sends the event at the first file-changed event durating debounce throttle.
                // If the content is updated multiple times within the duration, only the first change is
                // reflected to the preview.
                let mut paths = event.paths;
                paths.retain(|p| filter.should_retain(p));

                if !paths.is_empty() {
                    log::debug!("Files change event from watcher: {:?}", paths);
                    channel.send_event(UserEvent::WatchedFilesChanged(paths));
                }

                filter.cleanup_debouncer();
            }
            Ok(event) => log::debug!("Ignored filesystem event: {:?}", event),
            Err(err) => {
                log::error!("Error on watching file changes: {}", err);
                channel.send_event(UserEvent::Error(err.into()));
            }
        })?;
        Ok(watcher)
    }

    fn watch(&mut self, path: &Path) -> Result<()> {
        let (path, mode) = find_path_to_watch(path)?;
        log::debug!("Watching path {:?} with mode={:?}", path, mode);
        <RecommendedWatcher as NotifyWatcher>::watch(self, path, mode)
            .context("Error while starting to watch a path. Note: Watching non-existing path is unsupported. Instead watch its parent directory")
    }

    fn unwatch(&mut self, path: &Path) -> Result<()> {
        <RecommendedWatcher as NotifyWatcher>::unwatch(self, path)?;
        Ok(())
    }
}

pub struct NopWatcher;

impl Watcher for NopWatcher {
    fn new<E: EventLoop>(_event_loop: &E, _filter: PathFilter) -> Result<Self> {
        Ok(Self)
    }
    fn watch(&mut self, _path: &Path) -> Result<()> {
        Ok(())
    }
    fn unwatch(&mut self, _path: &Path) -> Result<()> {
        Ok(())
    }
}
