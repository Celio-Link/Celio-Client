/**
 * The emulator's games kept in this browser's IndexedDB: each ROM with its battery
 * save, so they can be played again without choosing the files. Nothing leaves the
 * device. Every call fails soft: private windows and blocked storage just keep nothing.
 */

const DB_NAME = 'celio-emulator';
const DB_VERSION = 1;
const GAMES = 'games';
// ROM bytes are kept apart so listing the games doesn't read them
const ROMS = 'roms';

export interface StoredGame {
  /** CRC-32 of the ROM */
  id: string;
  /** e.g. "Pokémon FireRed" */
  title: string;
  /** Name of the ROM dump */
  name: string;
  save: Uint8Array | null;
  /** The game saved since its save was last downloaded */
  unsaved: boolean;
  addedAt: number;
  playedAt: number;
}

export class GameStore {
  private queue: Promise<unknown> = Promise.resolve();

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(GAMES, { keyPath: 'id' });
        req.result.createObjectStore(ROMS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async run<T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction, done: (value: T) => void) => void): Promise<T | undefined> {
    const db = await this.open();
    try {
      return await new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        let result: T | undefined;
        fn(tx, (value) => { result = value; });
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  // Writes run in order, so an older save can't overwrite a newer one
  private write<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** The kept games without their ROMs, last played first. */
  async list(): Promise<StoredGame[]> {
    try {
      const games = await this.run<StoredGame[]>([GAMES], 'readonly', (tx, done) => {
        tx.objectStore(GAMES).getAll().onsuccess = (e) => done((e.target as IDBRequest<StoredGame[]>).result);
      });
      return (games ?? []).sort((a, b) => b.playedAt - a.playedAt);
    } catch {
      return [];
    }
  }

  /** One kept game with its ROM, or null. */
  async get(id: string): Promise<(StoredGame & { rom: Uint8Array }) | null> {
    try {
      const game = await this.run<StoredGame & { rom: Uint8Array }>([GAMES, ROMS], 'readonly', (tx, done) => {
        tx.objectStore(GAMES).get(id).onsuccess = (e) => {
          const stored = (e.target as IDBRequest<StoredGame | undefined>).result;
          if (!stored) return;
          tx.objectStore(ROMS).get(id).onsuccess = (r) => {
            const rom = (r.target as IDBRequest<ArrayBuffer | undefined>).result;
            if (rom) done({ ...stored, rom: new Uint8Array(rom) });
          };
        };
      });
      return game ?? null;
    } catch {
      return null;
    }
  }

  /** Keeps a game that was just started (its ROM is stored once). */
  put(game: { id: string; title: string; name: string; rom: Uint8Array; save: Uint8Array | null; unsaved: boolean }): Promise<boolean> {
    return this.write(async () => {
      try {
        const now = Date.now();
        await this.run<void>([GAMES, ROMS], 'readwrite', (tx) => {
          const games = tx.objectStore(GAMES);
          games.get(game.id).onsuccess = (e) => {
            const old = (e.target as IDBRequest<StoredGame | undefined>).result;
            if (!old) tx.objectStore(ROMS).put(game.rom.slice().buffer, game.id);
            const stored: StoredGame = {
              id: game.id, title: game.title, name: game.name, save: game.save, unsaved: game.unsaved,
              addedAt: old?.addedAt ?? now, playedAt: now,
            };
            games.put(stored);
          };
        });
        return true;
      } catch {
        return false;
      }
    });
  }

  /** The game saved: keeps the new save, marked as not downloaded yet. */
  updateSave(id: string, save: Uint8Array): Promise<boolean> {
    return this.update(id, game => { game.save = save; game.unsaved = true; });
  }

  markDownloaded(id: string): Promise<boolean> {
    return this.update(id, game => { game.unsaved = false; });
  }

  private update(id: string, change: (game: StoredGame) => void): Promise<boolean> {
    return this.write(async () => {
      try {
        await this.run<void>([GAMES], 'readwrite', (tx) => {
          const games = tx.objectStore(GAMES);
          games.get(id).onsuccess = (e) => {
            const game = (e.target as IDBRequest<StoredGame | undefined>).result;
            if (!game) return;
            change(game);
            games.put(game);
          };
        });
        return true;
      } catch {
        return false;
      }
    });
  }

  remove(id: string): Promise<boolean> {
    return this.write(async () => {
      try {
        await this.run<void>([GAMES, ROMS], 'readwrite', (tx) => {
          tx.objectStore(GAMES).delete(id);
          tx.objectStore(ROMS).delete(id);
        });
        return true;
      } catch {
        return false;
      }
    });
  }
}
