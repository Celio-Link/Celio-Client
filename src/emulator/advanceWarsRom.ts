/**
 * The Advance Wars cartridges the emulator plays, recognized like the Pokémon ones by the
 * CRC-32 of the whole ROM. Each game links with its own variant of the Advance Wars mode.
 */
import {GameVariant} from './link/awProtocol';

export type AdvanceWarsGame = 'Advance Wars' | 'Advance Wars 2';

export interface AdvanceWarsRom {
  /** CRC-32 of the ROM, 8 lowercase hex digits; also the id it is kept under */
  crc32: string;
  /** Game code from the cartridge header, e.g. AWRE */
  code: string;
  revision: number;
  /** Name of the dump, e.g. "Advance Wars (USA) (Rev 1)" */
  name: string;
  game: AdvanceWarsGame;
  variant: GameVariant;
}

const GAMES: Record<string, AdvanceWarsGame> = {
  AWR: 'Advance Wars',
  AW2: 'Advance Wars 2',
};

const KNOWN_DUMPS: [crc32: string, code: string, revision: number, name: string][] = [
  ['dbef116c', 'AWRE', 0, 'Advance Wars (USA)'],
  ['26fd0fc9', 'AWRE', 1, 'Advance Wars (USA) (Rev 1)'],
  ['66fb29e9', 'AWRP', 0, 'Advance Wars (Europe) (En,Fr,De,Es)'],
  ['5ad0e571', 'AW2E', 0, 'Advance Wars 2 - Black Hole Rising (USA)'],
  ['5a09aae6', 'AW2P', 0, 'Advance Wars 2 - Black Hole Rising (Europe) (En,Fr,De,Es,It)'],
];

const KNOWN = new Map<string, AdvanceWarsRom>(KNOWN_DUMPS.map(([crc32, code, revision, name]) => {
  const game = GAMES[code.slice(0, 3)];
  return [crc32, { crc32, code, revision, name, game, variant: game === 'Advance Wars 2' ? GameVariant.Aw2 : GameVariant.Aw1 }];
}));

/** A known dump by its CRC-32. */
export function knownAdvanceWarsRom(crc: string): AdvanceWarsRom | undefined {
  return KNOWN.get(crc);
}

/** The Advance Wars game a cartridge header's game code belongs to, in any region. */
export function advanceWarsGame(code: string): AdvanceWarsGame | undefined {
  return GAMES[code.slice(0, 3)];
}

/** The dumps the emulator plays, for telling the player which ones they are. */
export function advanceWarsDumps(): string[] {
  return KNOWN_DUMPS.map(dump => dump[3]);
}
