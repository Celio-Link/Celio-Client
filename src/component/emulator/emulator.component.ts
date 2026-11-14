import {Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild, computed} from '@angular/core';
import {EmulatorService} from '../../services/emulator.service';
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
})
export class EmulatorComponent implements OnInit, OnDestroy {

  /** The games the page links: the emulator takes the ROMs of this series. */
  @Input() series: GameSeries = 'pokemon';

  /** The link mode is running: the game can't be changed, reset, given another save or closed. */
  @Input() linked = false;
  /** The player closed the emulator, to choose how to link again. */
  @Output() closed = new EventEmitter<void>();

  protected fullscreen = false;
  protected dragging = false;
  protected readonly game = computed(() => this.service.game());

  private screenCanvas: HTMLCanvasElement | null = null;
  private touchArea: HTMLElement | null = null;

  constructor(protected service: EmulatorService, private toast: ToastService, private host: ElementRef<HTMLElement>) {}

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
    this.service.detachView();
    if (this.fullscreen) this.exitFullscreen();
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
    if (romFile && saveFile && await this.service.hasUnsavedProgress(romFile, this.series)
        && !confirm('This browser keeps progress in this game that you haven\'t downloaded. Play from your save file instead?')) {
      return;
    }
    if (!romFile && saveFile && this.service.unsaved()
        && !confirm('The game has saved since you last downloaded its save. Load your save file instead?')) {
      return;
    }
    const result = await this.service.openFiles(files, this.series);
    if (!result.ok) this.toast.show(result.message, 'error', 5000);
  }

  protected async play(id: string): Promise<void> {
    const result = await this.service.playStored(id);
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
    this.closed.emit();
  }

  protected toggleSound(): void {
    this.service.setMuted(!this.service.muted());
  }

  protected toggleFullscreen(): void {
    if (this.fullscreen) {
      this.exitFullscreen();
      return;
    }
    this.fullscreen = true;
    this.host.nativeElement.requestFullscreen?.().catch(() => {});
  }

  private exitFullscreen(): void {
    this.fullscreen = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  @HostListener('document:fullscreenchange')
  protected onFullscreenChange(): void {
    if (!document.fullscreenElement) this.fullscreen = false;
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.fullscreen) this.exitFullscreen();
  }
}
