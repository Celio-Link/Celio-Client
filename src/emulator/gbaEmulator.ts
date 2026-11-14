/**
 * Game Boy Advance emulator (mGBA's GBA core compiled to WebAssembly, public/emulator/mgba-gba.*)
 * running in the page: screen, sound, keys, battery save and the link port.
 *
 * The game runs by cycle count, in step with real time: paced by the sound output
 * when sound is running (the audio thread keeps going in background tabs, which a
 * link session needs), otherwise by the clock.
 */
import {GBA_CYCLES_PER_SECOND, GbaLinkPort, LinkRole} from './link/gbaLinkPort';

export const GBA_KEYS = {
  A: 1, B: 2, SELECT: 4, START: 8, RIGHT: 16, LEFT: 32, UP: 64, DOWN: 128, R: 256, L: 512,
} as const;
export type GbaKey = keyof typeof GBA_KEYS;

export const SCREEN_WIDTH = 240;
export const SCREEN_HEIGHT = 160;

const FRAME_CYCLES = 280896;
// The most the game runs at once; a longer stall is skipped, not caught up
const MAX_CATCH_UP_CYCLES = 6 * FRAME_CYCLES;
// Without sound the game runs this far ahead of the clock
const CLOCK_LEAD_CYCLES = FRAME_CYCLES;
// With sound, this much is queued for playback
const AUDIO_LEAD_SECONDS = 0.07;
const SAVE_CHECK_FRAMES = 60;

/** The exports of mgba-gba.js (see emulator/gba_emu.c). */
export interface GbaCoreModule {
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
  HEAPU32: Uint32Array;
  onLinkTransfer?: (rx: number) => void;
  _emu_alloc(size: number): number;
  _emu_free(ptr: number): void;
  _emu_load(rom: number, romSize: number, save: number, saveSize: number): number;
  _emu_unload(): void;
  _emu_reset(): void;
  _emu_set_sample_rate(rate: number): void;
  _emu_set_keys(keys: number): void;
  _emu_run(cycles: number): number;
  _emu_frames(): number;
  _emu_video(): number;
  _emu_audio(): number;
  _emu_audio_buffer(): number;
  _emu_save_size(): number;
  _emu_save_data(): number;
  _emu_read8(address: number): number;
  _emu_read16(address: number): number;
  _emu_read32(address: number): number;
  _emu_write8(address: number, value: number): void;
  _emu_write16(address: number, value: number): void;
  _emu_write32(address: number, value: number): void;
  _emu_cpu_pc(): number;
  _emu_link_config(role: number, seat: number, players: number): void;
  _emu_link_stage(slot0: number, slot1: number, slot2: number, slot3: number): void;
  _emu_link_clock(cycles: number): void;
  _emu_link_transfers(): number;
}

type CoreFactory = (options: { locateFile: (path: string) => string }) => Promise<GbaCoreModule>;

interface AudioOutput {
  ctx: AudioContext;
  gain: GainNode;
  node: AudioWorkletNode | null;
  ready: boolean;
  pushed: number;
  taken: number;
  takenAt: number;
  scratch: Float32Array;
}

export class GbaEmulator {
  /** baseUrl: where mgba-gba.js and mgba-gba.wasm are served. */
  static async create(baseUrl: string): Promise<GbaEmulator> {
    const base = new URL(baseUrl, document.baseURI);
    const url = new URL('mgba-gba.js', base).href;
    const { default: createGbaEmu } = await import(/* @vite-ignore */ url) as { default: CoreFactory };
    return new GbaEmulator(await createGbaEmu({ locateFile: (path) => new URL(path, base).href }));
  }

  loaded = false;
  running = false;
  /** Called with the battery save when the game has written to it. */
  onSaveChange: ((save: Uint8Array) => void) | null = null;
  onFrame: ((frames: number) => void) | null = null;

  private keySources = new Map<string, number>();
  private lastSave: Uint8Array | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private image: ImageData | null = null;
  private drawnFrame = -1;
  private reportedFrame = 0;
  private savedAtFrame = 0;
  private audioPaced = false;
  private rafId: number | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private clockStart = 0;
  private clockCycles = 0;
  private audio: AudioOutput | null = null;
  private volume = 1;
  private transferHandler: ((rx: number) => void) | null = null;
  private readonly onVisibility = () => this.schedule();

  constructor(readonly m: GbaCoreModule) {
    m.onLinkTransfer = (rx) => {
      try {
        this.transferHandler?.(rx);
      } catch (e) {
        console.error('Link transfer handler failed:', e);
      }
    };
  }

  /** Loads a ROM (and battery save). Returns false when the core rejects it. */
  load(rom: Uint8Array, save: Uint8Array | null = null): boolean {
    const m = this.m;
    const romPtr = m._emu_alloc(rom.length);
    m.HEAPU8.set(rom, romPtr);
    let savePtr = 0;
    if (save && save.length) {
      savePtr = m._emu_alloc(save.length);
      m.HEAPU8.set(save, savePtr);
    }
    const rc = m._emu_load(romPtr, rom.length, savePtr, save ? save.length : 0);
    if (savePtr) m._emu_free(savePtr);
    this.loaded = rc === 0;
    this.drawnFrame = -1;
    this.reportedFrame = 0;
    this.savedAtFrame = 0;
    if (this.audio) m._emu_set_sample_rate(this.audio.ctx.sampleRate);
    this.applyKeys();
    this.lastSave = this.loaded ? this.getSave() : null;
    return this.loaded;
  }

  unload(): void {
    this.stop();
    this.m._emu_unload();
    this.loaded = false;
  }

  /** Power-cycles the game; the battery save is kept. */
  reset(): void {
    if (this.loaded) this.m._emu_reset();
  }

  /** Frames the game has finished since it was loaded. */
  get frames(): number {
    return this.loaded ? this.m._emu_frames() : 0;
  }

  getSave(): Uint8Array {
    const m = this.m;
    const size = m._emu_save_size();
    if (size <= 0) return new Uint8Array(0);
    const ptr = m._emu_save_data();
    return m.HEAPU8.slice(ptr, ptr + size);
  }

  read8(address: number): number {
    return this.m._emu_read8(address);
  }

  read16(address: number): number {
    return this.m._emu_read16(address);
  }

  read32(address: number): number {
    return this.m._emu_read32(address) >>> 0;
  }

  /** Keys from one input source (keyboard, gamepad, touch...); all sources are OR'ed. */
  setKeys(source: string, mask: number): void {
    if (mask) this.keySources.set(source, mask);
    else this.keySources.delete(source);
    this.applyKeys();
  }

  private applyKeys(): void {
    let mask = 0;
    for (const value of this.keySources.values()) mask |= value;
    // Opposite directions at once confuse some games
    const horizontal = GBA_KEYS.LEFT | GBA_KEYS.RIGHT;
    const vertical = GBA_KEYS.UP | GBA_KEYS.DOWN;
    if ((mask & horizontal) === horizontal) mask &= ~horizontal;
    if ((mask & vertical) === vertical) mask &= ~vertical;
    if (this.loaded) this.m._emu_set_keys(mask);
  }

  /** The link port, driven in the game's time from inside its run. */
  linkPort(): GbaLinkPort {
    const m = this.m;
    return {
      configure: (role: LinkRole, seat: number, players: number) => m._emu_link_config(role, seat, players),
      stage: (slots: readonly number[]) => m._emu_link_stage(slots[0] ?? 0xFFFF, slots[1] ?? 0xFFFF, slots[2] ?? 0xFFFF, slots[3] ?? 0xFFFF),
      clock: (cycles: number) => m._emu_link_clock(Math.max(0, Math.round(cycles))),
      setTransferHandler: (handler) => { this.transferHandler = handler; },
    };
  }

  // ==================== Clock ====================

  start(): void {
    if (this.running || !this.loaded) return;
    this.running = true;
    this.resetClock();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.timerId !== null) clearTimeout(this.timerId);
    this.rafId = null;
    this.timerId = null;
    // Nothing to play while stopped; enableAudio resumes it. Asked for whatever the state reads: it lags behind
    // a resume or suspend still under way, and the two take effect in the order they were asked for
    this.audio?.ctx.suspend().catch(() => {});
  }

  private resetClock(): void {
    this.clockStart = performance.now();
    this.clockCycles = 0;
    if (this.audio) {
      this.audio.pushed = this.audio.taken;
      this.audio.takenAt = performance.now();
    }
  }

  private audioClock(): boolean {
    return !!(this.audio && this.audio.ready && this.audio.ctx.state === 'running');
  }

  /** Cycles the game should have run by now that it hasn't yet. */
  private due(): number {
    const now = performance.now();
    if (this.audioClock()) {
      const a = this.audio!;
      const rate = a.ctx.sampleRate;
      // Played since the worklet's last report, estimated from the clock
      const taken = a.taken + Math.min((now - a.takenAt) / 1000, 0.02) * rate;
      return ((taken + AUDIO_LEAD_SECONDS * rate - a.pushed) * GBA_CYCLES_PER_SECOND) / rate;
    }
    return ((now - this.clockStart) * GBA_CYCLES_PER_SECOND) / 1000 + CLOCK_LEAD_CYCLES - this.clockCycles;
  }

  /** Runs the game up to the present. */
  advance(): void {
    if (!this.running) return;
    const audioPaced = this.audioClock();
    if (audioPaced !== this.audioPaced) {
      this.audioPaced = audioPaced;
      this.resetClock();
    }
    let due = Math.floor(this.due());
    if (due <= 0) return;
    if (due > MAX_CATCH_UP_CYCLES) {
      due = FRAME_CYCLES;
      this.resetClock();
    }
    while (due > 0 && this.running) {
      const ran = this.m._emu_run(Math.min(due, FRAME_CYCLES));
      this.ran(ran);
      due -= ran;
    }
  }

  private ran(cycles: number): void {
    if (cycles <= 0) return;
    this.clockCycles += cycles;
    const m = this.m;
    const samples = m._emu_audio();
    if (samples > 0 && this.audioPaced) this.pushAudio(m._emu_audio_buffer() >> 1, samples);
    const frames = m._emu_frames();
    if (frames - this.savedAtFrame >= SAVE_CHECK_FRAMES) {
      this.savedAtFrame = frames;
      this.checkSave();
    }
    if (frames !== this.reportedFrame) {
      this.reportedFrame = frames;
      this.onFrame?.(frames);
    }
  }

  /** Reports a changed battery save to onSaveChange now (it is also checked every second). */
  checkSave(): void {
    if (!this.onSaveChange || !this.loaded) return;
    const save = this.getSave();
    const last = this.lastSave;
    if (last && last.length === save.length && last.every((v, i) => v === save[i])) return;
    this.lastSave = save;
    this.onSaveChange(save);
  }

  private schedule(): void {
    if (!this.running) return;
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (typeof requestAnimationFrame === 'function' && !hidden) {
      if (this.rafId === null) this.rafId = requestAnimationFrame(() => { this.rafId = null; this.tick(); });
    } else if (this.timerId === null) {
      this.timerId = setTimeout(() => { this.timerId = null; this.tick(); }, 16);
    }
  }

  private tick(): void {
    if (!this.running) return;
    if (!this.audioClock()) this.advance();
    this.draw();
    this.schedule();
  }

  // ==================== Screen ====================

  attachCanvas(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    if (canvas) {
      canvas.width = SCREEN_WIDTH;
      canvas.height = SCREEN_HEIGHT;
    }
    this.image = null;
    this.drawnFrame = -1;
    this.draw();
  }

  private draw(): void {
    if (!this.ctx || !this.loaded) return;
    const m = this.m;
    const frame = m._emu_frames();
    if (frame === this.drawnFrame) return;
    this.drawnFrame = frame;
    if (!this.image) this.image = this.ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    const base = m._emu_video();
    this.image.data.set(m.HEAPU8.subarray(base, base + SCREEN_WIDTH * SCREEN_HEIGHT * 4));
    this.ctx.putImageData(this.image, 0, 0);
  }

  // ==================== Sound ====================

  /** Starts sound output; call from a user gesture. The game then follows the sound clock. */
  async enableAudio(workletUrl: string): Promise<void> {
    if (this.audio || typeof AudioContext === 'undefined') {
      if (this.audio) await this.audio.ctx.resume().catch(() => {});
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    gain.connect(ctx.destination);
    this.audio = { ctx, gain, node: null, ready: false, pushed: 0, taken: 0, takenAt: performance.now(), scratch: new Float32Array(8192) };
    this.m._emu_set_sample_rate(ctx.sampleRate);
    try {
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, 'gba-audio', { outputChannelCount: [2] });
      node.port.onmessage = (e) => this.onAudioTaken(e.data as number);
      node.connect(gain);
      this.audio.node = node;
      this.audio.ready = true;
    } catch (e) {
      console.warn('Emulator sound unavailable:', e);
    }
    // Unless the game was stopped while the worklet loaded
    if (this.running) await ctx.resume().catch(() => {});
  }

  /** 0 mutes the sound; the game keeps following the sound clock. */
  setVolume(volume: number): void {
    this.volume = volume;
    if (this.audio) this.audio.gain.gain.value = volume;
  }

  private onAudioTaken(taken: number): void {
    const a = this.audio!;
    a.taken = Math.max(a.taken, taken);
    a.takenAt = performance.now();
    if (this.running && this.audioClock()) this.advance();
  }

  private pushAudio(offset: number, samples: number): void {
    const a = this.audio!;
    if (!a.ready || !a.node) return;
    const n = samples * 2;
    const out = n <= a.scratch.length ? a.scratch.subarray(0, n) : new Float32Array(n);
    const src = this.m.HEAP16;
    for (let i = 0; i < n; i++) out[i] = src[offset + i] / 32768;
    a.node.port.postMessage(out.slice());
    a.pushed += samples;
  }

  destroy(): void {
    this.unload();
    if (this.audio) {
      this.audio.ctx.close().catch(() => {});
      this.audio = null;
    }
    this.attachCanvas(null);
  }
}
