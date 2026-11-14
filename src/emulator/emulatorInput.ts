import {GBA_KEYS, GbaEmulator, GbaKey} from './gbaEmulator';

const KEYBOARD: Record<string, number> = {
  ArrowUp: GBA_KEYS.UP, ArrowDown: GBA_KEYS.DOWN, ArrowLeft: GBA_KEYS.LEFT, ArrowRight: GBA_KEYS.RIGHT,
  KeyX: GBA_KEYS.A, KeyZ: GBA_KEYS.B, KeyA: GBA_KEYS.L, KeyS: GBA_KEYS.R,
  Enter: GBA_KEYS.START, Space: GBA_KEYS.SELECT, Backspace: GBA_KEYS.SELECT, ShiftLeft: GBA_KEYS.SELECT, ShiftRight: GBA_KEYS.SELECT,
};
// The letters also by what the key is labelled, so the page's hint holds on AZERTY or QWERTZ keyboards
const LETTERS: Record<string, number> = { x: GBA_KEYS.A, z: GBA_KEYS.B, a: GBA_KEYS.L, s: GBA_KEYS.R };

// Standard gamepad layout, by position: right face button = A, bottom = B
const GAMEPAD_BUTTONS: [number, number][] = [
  [1, GBA_KEYS.A], [0, GBA_KEYS.B], [4, GBA_KEYS.L], [5, GBA_KEYS.R], [9, GBA_KEYS.START], [8, GBA_KEYS.SELECT],
  [12, GBA_KEYS.UP], [13, GBA_KEYS.DOWN], [14, GBA_KEYS.LEFT], [15, GBA_KEYS.RIGHT],
];

/**
 * Keyboard, gamepad and on-screen touch controls for the emulator. Keys are only
 * taken while isActive() says so and the focus is not in a text field. Touch
 * controls are the elements with a data-key attribute (A, B, L, R, START, SELECT,
 * UP, DOWN, LEFT, RIGHT) inside touchArea.
 */
export class EmulatorInput {
  // The GBA key each held keyboard key presses, by its code
  private held = new Map<string, number>();
  private pointers = new Map<number, number>();
  private padTimer: ReturnType<typeof setInterval> | null = null;
  private readonly onKeyDown = (e: KeyboardEvent) => this.key(e, true);
  private readonly onKeyUp = (e: KeyboardEvent) => this.key(e, false);
  private readonly onBlur = () => { this.held.clear(); this.emulator.setKeys('keyboard', 0); };
  private readonly onPad = () => this.watchGamepads();
  private readonly onPointer = (e: PointerEvent) => this.pointer(e);
  private readonly onPointerEnd = (e: PointerEvent) => this.pointerEnd(e);
  private readonly onContextMenu = (e: Event) => e.preventDefault();

  /** onGesture: a key or touch of the player's, which lets the page start its sound. */
  constructor(private emulator: GbaEmulator, private isActive: () => boolean, private touchArea: HTMLElement | null,
              private onGesture: () => void) {}

  attach(): void {
    // Capture, so the page's own key handlers see the event as handled
    document.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('gamepadconnected', this.onPad);
    this.watchGamepads();
    if (this.touchArea) {
      this.touchArea.addEventListener('pointerdown', this.onPointer);
      this.touchArea.addEventListener('pointermove', this.onPointer);
      for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) this.touchArea.addEventListener(type, this.onPointerEnd);
      this.touchArea.addEventListener('contextmenu', this.onContextMenu);
    }
  }

  detach(): void {
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('gamepadconnected', this.onPad);
    if (this.padTimer !== null) clearInterval(this.padTimer);
    this.padTimer = null;
    if (this.touchArea) {
      this.touchArea.removeEventListener('pointerdown', this.onPointer);
      this.touchArea.removeEventListener('pointermove', this.onPointer);
      for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) this.touchArea.removeEventListener(type, this.onPointerEnd);
      this.touchArea.removeEventListener('contextmenu', this.onContextMenu);
    }
    this.onBlur();
    this.pointers.clear();
    this.emulator.setKeys('touch', 0);
    this.emulator.setKeys('gamepad', 0);
  }

  private typing(): boolean {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (!down) {
      if (!this.held.delete(e.code)) return;
      e.preventDefault();
      this.applyKeyboard();
      return;
    }
    // A shortcut: the keys held with it may never see their keyup (Cmd on macOS)
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (this.held.size) this.onBlur();
      return;
    }
    const key = LETTERS[e.key.toLowerCase()] ?? KEYBOARD[e.code];
    if (key === undefined || !this.isActive() || this.typing()) return;
    e.preventDefault();
    this.held.set(e.code, key);
    this.onGesture();
    this.applyKeyboard();
  }

  private applyKeyboard(): void {
    let mask = 0;
    for (const key of this.held.values()) mask |= key;
    this.emulator.setKeys('keyboard', mask);
  }

  private watchGamepads(): void {
    if (this.padTimer !== null || typeof navigator.getGamepads !== 'function') return;
    this.padTimer = setInterval(() => this.pollGamepads(), 16);
  }

  private pollGamepads(): void {
    let mask = 0;
    let any = false;
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue;
      any = true;
      for (const [index, key] of GAMEPAD_BUTTONS) if (pad.buttons[index]?.pressed) mask |= key;
      const [x = 0, y = 0] = pad.axes;
      if (x < -0.5) mask |= GBA_KEYS.LEFT;
      if (x > 0.5) mask |= GBA_KEYS.RIGHT;
      if (y < -0.5) mask |= GBA_KEYS.UP;
      if (y > 0.5) mask |= GBA_KEYS.DOWN;
    }
    if (!any && this.padTimer !== null) {
      clearInterval(this.padTimer);
      this.padTimer = null;
    }
    this.emulator.setKeys('gamepad', this.isActive() ? mask : 0);
  }

  // Each finger presses whatever control is under it, so a thumb can slide across the D-pad
  private pointer(e: PointerEvent): void {
    if (!this.touchArea) return;
    if (e.type === 'pointermove' && !this.pointers.has(e.pointerId)) return;
    e.preventDefault();
    if (e.type === 'pointerdown') {
      this.onGesture();
      try { this.touchArea.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    }
    const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-key]');
    const name = target && this.touchArea.contains(target) ? target.dataset['key'] as GbaKey : undefined;
    this.pointers.set(e.pointerId, name ? GBA_KEYS[name] : 0);
    this.applyTouch();
  }

  private pointerEnd(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    this.applyTouch();
    // Lifting a finger, unlike touching down, lets iOS start sound
    if (e.type === 'pointerup') this.onGesture();
  }

  private applyTouch(): void {
    if (!this.touchArea) return;
    let mask = 0;
    for (const key of this.pointers.values()) mask |= key;
    for (const el of Array.from(this.touchArea.querySelectorAll<HTMLElement>('[data-key]'))) {
      const name = el.dataset['key'] as GbaKey;
      el.classList.toggle('pressed', (mask & GBA_KEYS[name]) !== 0);
    }
    this.emulator.setKeys('touch', mask);
  }
}
