mod app;
mod cli;
mod opener;
mod renderer;
mod webview;

use anyhow::Result;
use app::{App, AppControl};
pub use cli::Options;
use opener::SystemOpener;
use wry::application::event::{Event, StartCause, WindowEvent};
use wry::application::event_loop::{ControlFlow, EventLoop};
use wry::webview::WebView;

pub fn run(options: Options) -> Result<()> {
    let event_loop = EventLoop::with_user_event();
    let mut app = App::<WebView, SystemOpener>::new(options, &event_loop)?;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::NewEvents(StartCause::Init) => {
                log::debug!("Application has started");
            }
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
                log::debug!("Closing window was requested");
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(event) => {
                log::debug!("Handling user event {:?}", event);
                if let Err(err) = app.handle_user_event(event) {
                    log::error!("Could not handle user event: {}", err);
                }
            }
            Event::MenuEvent { menu_id, .. } => match app.handle_menu_event(menu_id) {
                Ok(AppControl::Exit) => *control_flow = ControlFlow::Exit,
                Ok(_) => {}
                Err(err) => log::error!("Could not handle menu event: {}", err),
            },
            _ => (),
        }
    });
}
