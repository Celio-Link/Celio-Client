/**
 * The games the emulator plays. Any ROM plays; a page plays its games as one series: the
 * Generation III Pokémon games, linked through the GBA online mode, or Advance Wars 1 and 2,
 * linked through the Advance Wars mode. The known cartridge dumps name the game a ROM is,
 */
import {crc32, headerCode, knownRom, pokemonGame, PokemonRom, romTitle} from './pokemonRom';
import {AdvanceWarsRom, advanceWarsGame, advanceWarsVariant, knownAdvanceWarsRom} from './advanceWarsRom';
import {GameVariant} from './link/awProtocol';

export type GameSeries = 'pokemon' | 'advanceWars';

export interface EmulatorGame {
  /** The series of the page it was opened on, which says how it links */
  series: GameSeries;
  /** CRC-32 of the ROM; also the id the game is kept under */
  crc32: string;
  /** Name of the ROM dump, or of the ROM file when it isn't a known dump */
  name: string;
  /** What the player sees, e.g. "Pokémon FireRed" */
  title: string;
  /** Bytes of the battery save a cartridge of the game holds, 0 when the dump isn't known */
  saveSize: number;
  /** The variant of the Advance Wars mode the game links with, when its dump or header says */
  awVariant?: GameVariant;
  /** The known dump, if it is one */
  pokemon?: PokemonRom;
  advanceWars?: AdvanceWarsRom;
}

export interface GameCheck {
  game: EmulatorGame;
  /** Something the player should know: the ROM isn't a known dump of the page's games */
  notice?: string;
}

const POKEMON_SAVE_SIZE = 0x20000;
const ADVANCE_WARS_SAVE_SIZE = 0x10000;

const SERIES_PAGE: Record<GameSeries, string> = {
  pokemon: 'Online Emulator Link',
  advanceWars: 'Advance Wars',
};

const SERIES_GAMES: Record<GameSeries, string> = {
  pokemon: 'Pokémon Ruby, Sapphire, Emerald, FireRed or LeafGreen',
  advanceWars: 'Advance Wars or Advance Wars 2',
};

/** The series of a known dump by its CRC-32. */
export function knownSeries(crc: string): GameSeries | undefined {
  if (knownRom(crc)) return 'pokemon';
  if (knownAdvanceWarsRom(crc)) return 'advanceWars';
  return undefined;
}

/** A ROM file's name without its extension, for naming a game that isn't a known dump. */
export function romFileName(fileName: string): string {
  return fileName.replace(/\.(gba|agb|bin)$/i, '').trim() || 'Game';
}

/** The game a ROM is, played on a page of one series; `name` names it when it isn't a known dump. */
export function describeGame(crc: string, rom: Uint8Array, series: GameSeries, name: string): EmulatorGame {
  const pokemon = knownRom(crc);
  if (pokemon) {
    return { series, crc32: crc, name: pokemon.name, title: romTitle(pokemon), saveSize: POKEMON_SAVE_SIZE, pokemon };
  }
  const advanceWars = knownAdvanceWarsRom(crc);
  if (advanceWars) {
    return {
      series, crc32: crc, name: advanceWars.name, title: advanceWars.game, saveSize: ADVANCE_WARS_SAVE_SIZE,
      awVariant: advanceWars.variant, advanceWars,
    };
  }
  return { series, crc32: crc, name, title: name, saveSize: 0, awVariant: advanceWarsVariant(headerCode(rom)) };
}

/** The game a ROM file is, played on a page of one series, and what the player should know about it. */
export function identifyGame(rom: Uint8Array, series: GameSeries, fileName: string): GameCheck {
  const game = describeGame(crc32(rom), rom, series, romFileName(fileName));
  return { game, notice: notice(game, headerCode(rom)) };
}

function notice(game: EmulatorGame, code: string): string | undefined {
  const known: GameSeries | undefined = game.pokemon ? 'pokemon' : game.advanceWars ? 'advanceWars' : undefined;
  if (known === game.series) return undefined;
  if (known) return `This is ${game.title}. It plays here, but it links on the ${SERIES_PAGE[known]} page.`;
  // Not a known dump: its header may still say which game it is
  const pokemon = pokemonGame(code);
  const advanceWars = advanceWarsGame(code);
  const title = pokemon ? `Pokémon ${pokemon}` : advanceWars;
  const titleSeries: GameSeries | undefined = pokemon ? 'pokemon' : advanceWars ? 'advanceWars' : undefined;
  if (titleSeries === game.series) return `This ${title} ROM isn't a known cartridge dump. It plays, but linking may not work.`;
  if (titleSeries) return `This looks like ${title}. It plays here, but it links on the ${SERIES_PAGE[titleSeries]} page.`;
  return `This isn't a known ${SERIES_GAMES[game.series]} ROM. It plays, but linking may not work.`;
}
