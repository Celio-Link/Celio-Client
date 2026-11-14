/**
 * The games the emulator plays, of either series: the Generation III Pokémon games, linked
 * through the GBA online mode, and Advance Wars 1 and 2, linked through the Advance Wars mode.
 * A page plays the games of one series.
 */
import {crc32, headerCode, identifyRom, knownRom, PokemonRom, romTitle} from './pokemonRom';
import {AdvanceWarsRom, advanceWarsDumps, advanceWarsGame, knownAdvanceWarsRom} from './advanceWarsRom';

export type GameSeries = 'pokemon' | 'advanceWars';

export interface EmulatorGame {
  series: GameSeries;
  /** CRC-32 of the ROM; also the id the game is kept under */
  crc32: string;
  /** Name of the ROM dump */
  name: string;
  /** What the player sees, e.g. "Pokémon FireRed" */
  title: string;
  /** Bytes of the battery save a cartridge of the game holds */
  saveSize: number;
  pokemon?: PokemonRom;
  advanceWars?: AdvanceWarsRom;
}

export type GameCheck =
  | { ok: true; game: EmulatorGame }
  | { ok: false; message: string };

const POKEMON_SAVE_SIZE = 0x20000;
const ADVANCE_WARS_SAVE_SIZE = 0x10000;

/** A known dump of either series by its CRC-32. */
export function knownGame(crc: string): EmulatorGame | undefined {
  const pokemon = knownRom(crc);
  if (pokemon) {
    return { series: 'pokemon', crc32: crc, name: pokemon.name, title: romTitle(pokemon), saveSize: POKEMON_SAVE_SIZE, pokemon };
  }
  const advanceWars = knownAdvanceWarsRom(crc);
  if (advanceWars) {
    return { series: 'advanceWars', crc32: crc, name: advanceWars.name, title: advanceWars.game, saveSize: ADVANCE_WARS_SAVE_SIZE, advanceWars };
  }
  return undefined;
}

/** The game a ROM file is, for a page that plays the games of one series. */
export function identifyGame(rom: Uint8Array, series: GameSeries): GameCheck {
  const known = knownGame(crc32(rom));
  if (known?.series === series) return { ok: true, game: known };
  if (known) {
    return {
      ok: false,
      message: known.series === 'pokemon'
        ? `${known.title} links on the Online Emulator Link page.`
        : `${known.title} links on the Advance Wars page.`,
    };
  }
  if (series === 'advanceWars') {
    const game = advanceWarsGame(headerCode(rom));
    return {
      ok: false,
      message: game
        ? `This ${game} ROM isn't one of the cartridge dumps the emulator plays: ${advanceWarsDumps().join(', ')}.`
        : 'This isn\'t an Advance Wars or Advance Wars 2 ROM.',
    };
  }
  const check = identifyRom(rom);
  return {
    ok: false,
    message: !check.ok && check.reason === 'unknownDump'
      ? `This Pokémon ${check.game} ROM doesn't match a cartridge dump. Use a clean dump of your own cartridge.`
      : 'This isn\'t a Pokémon Ruby, Sapphire, Emerald, FireRed or LeafGreen ROM.',
  };
}
