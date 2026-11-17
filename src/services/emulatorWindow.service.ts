import {Injectable, NgZone, signal} from '@angular/core';

// Wide enough for the emulator's buttons in one row, inside their panel box
const WIDTH = 820;
const HEIGHT = 700;
const TITLE = 'Celio Link – Emulator';

interface DocumentPictureInPicture {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
}

/**
 * A window of its own for the emulator, beside the page: a picture-in-picture window kept above
 * the others where the browser has them (Chrome, Edge), otherwise a popup window. The emulator
 * keeps running in the page; only its screen and buttons move into the window, which takes the
 * page's styles and theme.
 */
@Injectable({ providedIn: 'root' })
export class EmulatorWindowService {
  /** The open window, null when the emulator is in the page. */
  readonly window = signal<Window | null>(null);
  /** The window is a picture-in-picture window (it can't go full screen). */
  readonly pictureInPicture = signal(false);
  /**
   * The game can have a window of its own. Phones and tablets open a window as another tab, where
   * the game would pause whenever the page is in front: there it plays in the page.
   */
  readonly available = !window.matchMedia('(pointer: coarse)').matches;

  private cleanup: (() => void) | null = null;

  constructor(private zone: NgZone) {
    // The window can't outlive the page that runs its emulator
    window.addEventListener('pagehide', () => this.close());
  }

  /** Opens the window. Call straight from a click: browsers only open windows for one. */
  open(): void {
    if (!this.available) return;
    const open = this.window();
    if (open) {
      open.focus();
      return;
    }
    const pip = (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;
    if (pip) {
      pip.requestWindow({ width: WIDTH, height: HEIGHT })
        .then(win => this.zone.run(() => this.adopt(win, true)))
        .catch(error => console.warn('The emulator window didn\'t open:', error));
      return;
    }
    const left = window.screenX + Math.max(0, window.outerWidth - WIDTH - 40);
    const top = window.screenY + 80;
    const win = window.open('', 'celio-emulator', `popup,width=${WIDTH},height=${HEIGHT},left=${left},top=${top}`);
    if (win) this.adopt(win, false);
    else console.warn('The emulator window was blocked.');
  }

  /** Closes the window; the emulator goes back into the page. */
  close(): void {
    const win = this.window();
    if (!win) return;
    this.release();
    win.close();
  }

  private adopt(win: Window, pictureInPicture: boolean): void {
    const doc = win.document;
    // A popup of the same name left open from an earlier visit still shows that visit's page
    doc.head.replaceChildren();
    doc.body.replaceChildren();
    doc.title = TITLE;

    // Relative links in the page's styles (its font) resolve as they do in the page
    const base = doc.createElement('base');
    base.href = document.baseURI;
    doc.head.append(base);

    for (const node of Array.from(document.head.children)) this.copyStyle(node, doc);
    const own = doc.createElement('style');
    own.textContent = `
      html, body { height: 100%; }
      body { margin: 0; padding: 0.5rem; box-sizing: border-box; overflow: auto;
             background: var(--color-base-100); color: var(--color-base-content); }
    `;
    doc.head.append(own);

    const theme = () => {
      const value = document.documentElement.getAttribute('data-theme');
      if (value) doc.documentElement.setAttribute('data-theme', value);
    };
    theme();
    const themeObserver = new MutationObserver(theme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Angular adds a component's styles to the page the first time it shows one
    const styleObserver = new MutationObserver(records => {
      for (const record of records) record.addedNodes.forEach(node => this.copyStyle(node, doc));
    });
    styleObserver.observe(document.head, { childList: true });

    const onClosed = () => this.zone.run(() => this.release());
    win.addEventListener('pagehide', onClosed);
    // A popup closed while the page was in the background doesn't always tell it
    const closedCheck = pictureInPicture ? null : setInterval(() => { if (win.closed) onClosed(); }, 500);

    this.cleanup = () => {
      themeObserver.disconnect();
      styleObserver.disconnect();
      win.removeEventListener('pagehide', onClosed);
      if (closedCheck !== null) clearInterval(closedCheck);
    };
    this.pictureInPicture.set(pictureInPicture);
    this.window.set(win);
  }

  private release(): void {
    this.cleanup?.();
    this.cleanup = null;
    this.window.set(null);
    this.pictureInPicture.set(false);
  }

  private copyStyle(node: Node, doc: Document): void {
    if (node instanceof HTMLStyleElement) {
      doc.head.append(node.cloneNode(true));
    } else if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = node.href;
      // The build loads its styles late with media="print" and switches them on when loaded
      if (node.media && node.media !== 'print') link.media = node.media;
      doc.head.append(link);
    }
  }
}
