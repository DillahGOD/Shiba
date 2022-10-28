import { marked } from 'marked';
import hljs from 'highlight.js';
import Mousetrap from 'mousetrap';

interface Ipc {
    postMessage(m: string): void;
}

declare global {
    interface Window {
        myMarkdownPreview: Shiba;
        ipc: Ipc;
    }
}

type MessageFromMain =
    | {
          kind: 'content';
          content: string;
      }
    | {
          kind: 'key_mappings';
          keymaps: { [keybind: string]: string };
      };
type MessageToMain =
    | {
          kind: 'init';
      }
    | {
          kind: 'open';
          link: string;
      }
    | {
          kind: 'forward';
      }
    | {
          kind: 'back';
      };

function sendMessage(m: MessageToMain): void {
    window.ipc.postMessage(JSON.stringify(m));
}

const RE_ANCHOR_START = /^<a /;
const KEYMAP_ACTIONS: { [action: string]: () => void } = {
    ScrollDown(): void {
        window.scrollBy(0, window.innerHeight / 2);
    },
    ScrollUp(): void {
        window.scrollBy(0, -window.innerHeight / 2);
    },
    ScrollPageDown(): void {
        window.scrollBy(0, window.innerHeight);
    },
    ScrollPageUp(): void {
        window.scrollBy(0, -window.innerHeight);
    },
    Forward(): void {
        sendMessage({ kind: 'forward' });
    },
    Back(): void {
        sendMessage({ kind: 'back' });
    },
};

class MyRenderer extends marked.Renderer {
    override link(href: string, title: string, text: string): string {
        const rendered = super.link(href, title, text);
        return rendered.replace(RE_ANCHOR_START, '<a onclick="window.myMarkdownPreview.onLinkClicked(event)" ');
    }
}

marked.setOptions({
    renderer: new MyRenderer(),
    highlight: (code, lang) => {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    },
    langPrefix: 'hljs language-',
    gfm: true,
});

class Shiba {
    receive(msg: MessageFromMain): void {
        switch (msg.kind) {
            case 'content':
                const elem = document.getElementById('preview');
                if (elem === null) {
                    console.error("'preview' element is not found");
                    return;
                }
                elem.innerHTML = marked.parse(msg.content);
                break;
            case 'key_mappings':
                for (const [keybind, action] of Object.entries(msg.keymaps)) {
                    const callback = KEYMAP_ACTIONS[action];
                    if (callback) {
                        Mousetrap.bind(keybind, e => {
                            e.preventDefault();
                            e.stopPropagation();
                            callback();
                        });
                    } else {
                        console.error('Unknown action:', action);
                    }
                }
                console.log('foo', document.getElementById('preview'));
                document.getElementById('preview')?.focus();
                document.getElementById('preview')?.click();
                break;
            default:
                console.error('Unknown message:', msg);
                break;
        }
    }

    onLinkClicked(event: MouseEvent): void {
        event.preventDefault();
        if (event.target === null) {
            return;
        }
        const a = event.target as HTMLAnchorElement;
        const link = a.getAttribute('href');
        if (!link) {
            return;
        }
        sendMessage({
            kind: 'open',
            link,
        });
    }
}

window.myMarkdownPreview = new Shiba();
sendMessage({ kind: 'init' });
