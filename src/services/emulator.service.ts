import {Injectable, NgZone, signal} from '@angular/core';
import {GbaEmulator} from '../emulator/gbaEmulator';
import {EmulatorInput} from '../emulator/emulatorInput';
import {GameStore, StoredGame} from '../emulator/gameStore';
import {identifyRom, knownRom, PokemonRom, romTitle} from '../emulator/pokemonRom';
import {OnlineLinkAdapter} from '../emulator/link/onlineLinkAdapter';

const EMULATOR_URL = 'emulator/';
const MUTED_KEY = 'celio-emulator-muted';
const GBA_SAVE_SIZE = 0x20000;

export type OpenResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * The Game Boy Advance emulator that plays in the page: the running game, the games kept in
 * this browser, and the GBA online link the game is linked through. It stays loaded while the
 * player moves between pages; the game only runs while its screen is shown.
 */
@Injectable({ providedIn: 'root' })
export class EmulatorService {
  /** The game that is loaded, null when none is. */
  readonly game = signal<PokemonRom | null>(null);
  /** The game saved since its save was last downloaded. */
  readonly unsaved = signal(false);
  readonly muted = signal(readMuted());
  readonly library = signal<StoredGame[]>([]);
  /** A game or a save is being opened. */
  readonly starting = signal(false);

  private emulator: GbaEmulator | null = null;
  private emulatorLoad: Promise<GbaEmulator> | null = null;
  private adapter: OnlineLinkAdapter | null = null;
  private input: EmulatorInput | null = null;
  private readonly store = new GameStore();
  private gameId: string | null = null;
  private romName = '';
  // The loaded game's ROM, for starting it with another save
  private rom: Uint8Array | null = null;

  constructor(private zone: NgZone) {
    this.refreshLibrary();
    // The game may have saved within the last second, before its next save check
    const keepSave = () => this.emulator?.checkSave();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') keepSave();
    });
    window.addEventListener('pagehide', keepSave);
  }

  /** The GBA online link of the emulated GBA, for the link session. */
  get linkAdapter(): OnlineLinkAdapter | null {
    return this.adapter;
  }

  /** The link mode is running: the game shouldn't be changed or reset. */
  get linkActive(): boolean {
    return this.adapter?.active ?? false;
  }

  async refreshLibrary(): Promise<void> {
    this.library.set(await this.store.list());
  }

  /** Loads the emulator without a game, so a page can link through it while the player chooses one. */
  async prepare(): Promise<boolean> {
    try {
      await this.ensureEmulator();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Plays the chosen files: a ROM, optionally with its save. A save on its own replaces
   * the save of the loaded game. Call from a user gesture (it starts the sound).
   */
  openFiles(files: File[]): Promise<OpenResult> {
    return this.exclusive(() => this.open(files));
  }

  /** The kept game a ROM file belongs to has progress that was never downloaded. */
  async hasUnsavedProgress(romFile: File): Promise<boolean> {
    const check = identifyRom(new Uint8Array(await romFile.arrayBuffer()));
    return check.ok && this.library().some(game => game.id === check.rom.crc32 && game.unsaved);
  }

  /** Plays a game kept in this browser. */
  playStored(id: string): Promise<OpenResult> {
    return this.exclusive(async () => {
      const stored = await this.store.get(id);
      const rom = stored ? knownRom(stored.id) : undefined;
      if (!stored || !rom) return { ok: false, message: 'That game isn\'t kept in this browser any more.' };
      return this.start(stored.rom, rom, stored.save, stored.unsaved);
    });
  }

  async removeStored(id: string): Promise<void> {
    await this.store.remove(id);
    await this.refreshLibrary();
  }

  // One game or save opens at a time, from the first click on
  private async exclusive(job: () => Promise<OpenResult>): Promise<OpenResult> {
    if (this.starting()) return { ok: false, message: 'The game is still starting.' };
    this.starting.set(true);
    try {
      return await job();
    } finally {
      this.starting.set(false);
    }
  }

  private async open(files: File[]): Promise<OpenResult> {
    const romFile = files.find(f => !/\.sav$/i.test(f.name));
    const saveFile = files.find(f => /\.sav$/i.test(f.name));
    if (!romFile) {
      if (saveFile && this.game()) return this.loadSave(saveFile);
      return { ok: false, message: 'Choose your game\'s ROM (.gba), and its save (.sav) if you have one.' };
    }
    const rom = new Uint8Array(await romFile.arrayBuffer());
    const check = identifyRom(rom);
    if (!check.ok) {
      return {
        ok: false,
        message: check.reason === 'unknownDump'
          ? `This Pokémon ${check.game} ROM doesn't match a cartridge dump. Use a clean dump of your own cartridge.`
          : 'This isn\'t a Pokémon Ruby, Sapphire, Emerald, FireRed or LeafGreen ROM.',
      };
    }
    let save: Uint8Array | null = null;
    let unsaved = false;
    if (saveFile) {
      save = new Uint8Array(await saveFile.arrayBuffer());
      if (save.length < GBA_SAVE_SIZE) return { ok: false, message: `${saveFile.name} isn't a save of this game.` };
    } else {
      // Playing a kept game again from its ROM continues its save
      const stored = await this.store.get(check.rom.crc32);
      save = stored?.save ?? null;
      unsaved = stored?.unsaved ?? false;
    }
    return this.start(rom, check.rom, save, unsaved);
  }

  private async start(rom: Uint8Array, info: PokemonRom, save: Uint8Array | null, unsaved: boolean): Promise<OpenResult> {
    if (this.linkActive) return { ok: false, message: 'Disconnect the link before changing the game.' };
    let emulator: GbaEmulator;
    try {
      emulator = await this.ensureEmulator();
    } catch {
      return { ok: false, message: 'The emulator didn\'t load. Check your connection and try again.' };
    }
    this.closeGame();
    if (!emulator.load(rom, save)) return { ok: false, message: 'The emulator couldn\'t start this ROM.' };
    this.gameId = info.crc32;
    this.romName = info.name;
    this.rom = rom;
    this.game.set(info);
    this.unsaved.set(unsaved);
    // Its screen is already up when one game replaces another
    if (this.input) this.resume();
    await this.store.put({ id: info.crc32, title: romTitle(info), name: info.name, rom, save: save ?? emulator.getSave(), unsaved });
    await this.refreshLibrary();
    return { ok: true };
  }

  /** Restarts the loaded game with another save. */
  private async loadSave(file: File): Promise<OpenResult> {
    const id = this.gameId;
    const rom = this.rom;
    if (!id || !rom || !this.emulator) return { ok: false, message: 'Start a game first.' };
    if (this.linkActive) return { ok: false, message: 'Disconnect the link before loading a save.' };
    const save = new Uint8Array(await file.arrayBuffer());
    if (save.length < GBA_SAVE_SIZE) return { ok: false, message: `${file.name} isn't a save of this game.` };
    if (this.gameId !== id) return { ok: false, message: 'Start a game first.' };
    this.emulator.stop();
    if (!this.emulator.load(rom, save)) return { ok: false, message: 'The emulator couldn\'t start the game with this save.' };
    this.unsaved.set(false);
    if (this.input) this.resume();
    await this.store.updateSave(id, save);
    await this.store.markDownloaded(id);
    await this.refreshLibrary();
    return { ok: true };
  }

  /** The battery save as a file the player keeps, the size a cartridge holds. */
  downloadSave(): void {
    const emulator = this.emulator;
    const id = this.gameId;
    if (!emulator || !id) return;
    // A save from the last second is stored first, so it can't come back as not downloaded
    emulator.checkSave();
    const save = emulator.getSave();
    const url = URL.createObjectURL(new Blob([save as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = this.romName + '.sav';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.store.markDownloaded(id).then(() => this.zone.run(() => {
      if (this.gameId === id) this.unsaved.set(false);
      this.refreshLibrary();
    }));
  }

  /** Power-cycles the game; the battery save is kept. */
  reset(): void {
    if (!this.linkActive) this.emulator?.reset();
  }

  /** Closes the loaded game (its save stays kept in this browser). */
  close(): void {
    this.closeGame();
  }

  private closeGame(): void {
    if (!this.emulator || !this.game()) return;
    this.emulator.checkSave();
    this.adapter?.stop();
    this.emulator.unload();
    this.gameId = null;
    this.rom = null;
    this.game.set(null);
    this.unsaved.set(false);
  }

  setMuted(muted: boolean): void {
    this.muted.set(muted);
    this.emulator?.setVolume(muted ? 0 : 1);
    // Some browsers only start sound on a click like this one
    if (!muted) this.startSound();
    try {
      localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
    } catch { /* storage blocked */ }
  }

  /** Shows the game on this canvas, with these touch controls, and runs it. */
  attachView(canvas: HTMLCanvasElement, touchArea: HTMLElement | null): void {
    const emulator = this.emulator;
    if (!emulator) return;
    this.input?.detach();
    emulator.attachCanvas(canvas);
    const input = new EmulatorInput(emulator, () => !!this.game(), touchArea, () => this.startSound());
    this.input = input;
    this.zone.runOutsideAngular(() => input.attach());
    this.resume();
  }

  /** The game's screen went away: it pauses. */
  detachView(): void {
    this.input?.detach();
    this.input = null;
    this.emulator?.attachCanvas(null);
    this.emulator?.checkSave();
    this.emulator?.stop();
  }

  private resume(): void {
    const emulator = this.emulator;
    if (!emulator || !emulator.loaded) return;
    this.startSound();
    this.zone.runOutsideAngular(() => emulator.start());
  }

  /** The sound also clocks the game in background tabs, so a link keeps going there. */
  private startSound(): void {
    const emulator = this.emulator;
    if (!emulator) return;
    this.zone.runOutsideAngular(() => emulator.enableAudio(EMULATOR_URL + 'audio-worklet.js').catch(() => {}));
  }

  private ensureEmulator(): Promise<GbaEmulator> {
    this.emulatorLoad ??= this.createEmulator().catch((e) => {
      this.emulatorLoad = null;
      throw e;
    });
    return this.emulatorLoad;
  }

  private async createEmulator(): Promise<GbaEmulator> {
    const emulator = await this.zone.runOutsideAngular(() => GbaEmulator.create(EMULATOR_URL));
    emulator.setVolume(this.muted() ? 0 : 1);
    emulator.onSaveChange = (save) => {
      const id = this.gameId;
      if (!id) return;
      this.store.updateSave(id, save).then(() => this.zone.run(() => {
        if (this.gameId === id) this.unsaved.set(true);
        this.refreshLibrary();
      }));
    };
    this.emulator = emulator;
    this.adapter = new OnlineLinkAdapter(emulator.linkPort());
    return emulator;
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}
