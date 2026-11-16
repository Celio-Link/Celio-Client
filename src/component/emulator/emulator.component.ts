import {Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild, computed, effect, signal, untracked} from '@angular/core';
import {EmulatorService} from '../../services/emulator.service';
import {EmulatorWindowService} from '../../services/emulatorWindow.service';
import {ToastService} from '../../services/toast.service';
import {GameSeries} from '../../emulator/emulatorGame';

/**
 * The emulator in the page: choosing the game and its save, its screen, buttons and touch
 * controls. The game runs while this panel is shown.
 */
@Component({
  selector: 'celio-emulator',
  templateUrl: './emulator.component.html',
  styleUrl: './emulator.component.css',
  host: { '[class.emu-host-popped]': 'popped()' },
})
export class EmulatorComponent implements OnInit, OnDestroy {

  /** The games the page links: the emulator links any ROM it plays as this series. */
  @Input() series: GameSeries = 'pokemon';

  /** The link mode is running: the game can't be changed, reset, given another save or closed. */
  @Input() linked = false;
  /**
   * The game only plays in its own window and never goes back into the page: closing the window,
   * or putting it back into the page, closes the game.
   */
  @Input() windowOnly = false;
  /** The player closed the emulator, to choose how to link again. */
  @Output() closed = new EventEmitter<void>();

  protected fullscreen = false;
  protected dragging = false;
  protected readonly game = computed(() => this.service.game());
  /** The emulator is in a window of its own. */
  protected readonly popped = signal(false);

  /** The game plays only in its own window: where the browser has one for it (not on phones and tablets). */
  protected get ownWindow(): boolean {
    return this.windowOnly && this.emulatorWindow.available;
  }

  private screenCanvas: HTMLCanvasElement | null = null;
  private touchArea: HTMLElement | null = null;
  // Where the emulator was in the page while it is in its window
  private placeholder: Comment | null = null;
  private readonly moveBackNow = () => this.moveBack();
  // The window was open since it last closed
  private windowOpened = false;
  // Full screen in the page for a game from a picture-in-picture window, which can't go full screen
  private fullscreenFromWindow = false;

  constructor(protected service: EmulatorService, protected emulatorWindow: EmulatorWindowService,
              private toast: ToastService, private host: ElementRef<HTMLElement>) {
    effect(() => {
      const win = this.emulatorWindow.window();
      untracked(() => {
        if (win) {
          this.windowOpened = true;
          this.moveInto(win);
          return;
        }
        this.moveBack();
        if (this.windowOpened && this.ownWindow && !this.fullscreenFromWindow) this.service.close();
        this.windowOpened = false;
      });
    });
  }

  /** Moves the emulator into its window; the game keeps running in the page. */
  private moveInto(win: Window): void {
    const el = this.host.nativeElement;
    if (el.ownerDocument === win.document || !el.parentNode) return;
    if (this.fullscreen) this.exitFullscreen();
    this.placeholder = document.createComment('celio-emulator');
    el.before(this.placeholder);
    win.document.body.append(el);
    // While the window closes its page is still there to take the emulator out of
    win.addEventListener('pagehide', this.moveBackNow, { once: true });
    this.popped.set(true);
    this.reattach();
  }

  private moveBack(): void {
    if (!this.placeholder) return;
    const el = this.host.nativeElement;
    el.ownerDocument.defaultView?.removeEventListener('pagehide', this.moveBackNow);
    this.placeholder.replaceWith(el);
    this.placeholder = null;
    this.popped.set(false);
    this.reattach();
  }

  /** The screen is in another window now: the keys and frames come from there. */
  private reattach(): void {
    if (this.screenCanvas) this.attach();
  }

  protected backToPage(): void {
    this.emulatorWindow.close();
  }

  @ViewChild('screen') set screen(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.screenCanvas = ref?.nativeElement ?? null;
    this.attach();
  }

  @ViewChild('touch') set touch(ref: ElementRef<HTMLElement> | undefined) {
    this.touchArea = ref?.nativeElement ?? null;
    this.attach();
  }

  ngOnInit(): void {
    this.service.useSeries(this.series);
  }

  /** The games of the page's series that are kept in this browser. */
  protected kept() {
    return this.service.kept(this.series);
  }

  private attach(): void {
    if (this.screenCanvas) this.service.attachView(this.screenCanvas, this.touchArea);
    else this.service.detachView();
  }

  ngOnDestroy(): void {
    // Nothing to show the game on any more, also once it is back in the page
    this.screenCanvas = null;
    this.touchArea = null;
    this.service.detachView();
    if (this.fullscreen) this.exitFullscreen();
    // Back into the page, for Angular to take it out of there
    this.moveBack();
    this.emulatorWindow.close();
  }

  protected async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.open(files);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging = true;
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragging = false;
    await this.open(Array.from(event.dataTransfer?.files ?? []));
  }

  private async open(files: File[]): Promise<void> {
    if (!files.length) return;
    const romFile = files.find(f => !/\.sav$/i.test(f.name));
    const saveFile = files.find(f => /\.sav$/i.test(f.name));
    if (romFile && saveFile && await this.service.hasUnsavedProgress(romFile)
        && !confirm('This browser keeps progress in this game that you haven\'t downloaded. Play from your save file instead?')) {
      return;
    }
    if (!romFile && saveFile && this.service.unsaved()
        && !confirm('The game has saved since you last downloaded its save. Load your save file instead?')) {
      return;
    }
    const result = await this.service.openFiles(files, this.series);
    if (!result.ok) this.toast.show(result.message, 'error', 5000);
    else if (result.notice) this.toast.show(result.notice, 'warning', 6000);
  }

  protected async play(id: string): Promise<void> {
    const result = await this.service.playStored(id, this.series);
    if (!result.ok) this.toast.show(result.message, 'error', 5000);
  }

  protected async remove(id: string, unsaved: boolean): Promise<void> {
    if (unsaved && !confirm('This game has progress you haven\'t downloaded. Remove it from this browser anyway?')) return;
    await this.service.removeStored(id);
  }

  protected reset(): void {
    if (confirm('Restart the game? Anything since your last save in the game is lost.')) this.service.reset();
  }

  protected changeGame(): void {
    if (this.fullscreen) this.exitFullscreen();
    this.service.close();
  }

  protected closeEmulator(): void {
    if (this.fullscreen) this.exitFullscreen();
    this.service.close();
    // Out of its window the game is gone, and the page shows choosing a game again
    if (this.ownWindow && this.popped()) return;
    this.closed.emit();
  }

  protected toggleSound(): void {
    this.service.setMuted(!this.service.muted());
  }

  protected toggleFrame(): void {
    this.service.setFrame(!this.service.frame());
  }

  protected toggleFullscreen(): void {
    if (this.fullscreen) {
      const backToWindow = this.fullscreenFromWindow;
      this.exitFullscreen();
      // Straight from the click, which a window needs to open
      if (backToWindow) this.emulatorWindow.open();
      return;
    }
    if (this.popped() && this.emulatorWindow.pictureInPicture()) {
      // A picture-in-picture window can't go full screen: the game goes full screen in the page
      // instead, and back into its window when full screen ends with this button
      this.fullscreenFromWindow = true;
      this.moveBack();
      this.emulatorWindow.close();
    }
    this.fullscreen = true;
    this.host.nativeElement.requestFullscreen?.().catch(() => {});
  }

  private exitFullscreen(): void {
    this.fullscreen = false;
    this.fullscreenFromWindow = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  @HostListener('document:fullscreenchange')
  protected onFullscreenChange(): void {
    if (document.fullscreenElement) return;
    this.fullscreen = false;
    this.fullscreenFromWindow = false;
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.fullscreen) this.exitFullscreen();
  }
}
