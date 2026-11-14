/**
 * The Generation III Pokémon cartridges the emulator plays: Ruby, Sapphire, Emerald,
 * FireRed and LeafGreen in every language and revision, recognized by the CRC-32 of
 * the whole ROM so only clean cartridge dumps are taken.
 */

export type PokemonGame = 'Ruby' | 'Sapphire' | 'Emerald' | 'FireRed' | 'LeafGreen';
export type PokemonLanguage = 'Japanese' | 'English' | 'French' | 'German' | 'Italian' | 'Spanish';

export interface PokemonRom {
  /** CRC-32 of the ROM, 8 lowercase hex digits; also the id it is kept under */
  crc32: string;
  /** Game code from the cartridge header, e.g. BPRE */
  code: string;
  revision: number;
  /** Name of the dump, e.g. "Pokemon - FireRed Version (USA, Europe) (Rev 1)" */
  name: string;
  game: PokemonGame;
  language: PokemonLanguage;
}

export type RomCheck =
  | { ok: true; rom: PokemonRom }
  | { ok: false; reason: 'notPokemon' | 'unknownDump'; game?: PokemonGame };

const GAMES: Record<string, PokemonGame> = {
  AXV: 'Ruby',
  AXP: 'Sapphire',
  BPE: 'Emerald',
  BPR: 'FireRed',
  BPG: 'LeafGreen',
};

const LANGUAGES: Record<string, PokemonLanguage> = {
  J: 'Japanese',
  E: 'English',
  F: 'French',
  D: 'German',
  I: 'Italian',
  S: 'Spanish',
};

const KNOWN_DUMPS: [crc32: string, code: string, revision: number, name: string][] = [
  ['cee9471a', 'AXVJ', 0, 'Pocket Monsters - Ruby (Japan)'],
  ['b448a337', 'AXVJ', 1, 'Pocket Monsters - Ruby (Japan) (Rev 1)'],
  ['f0815ee7', 'AXVE', 0, 'Pokemon - Ruby Version (USA, Europe)'],
  ['61641576', 'AXVE', 1, 'Pokemon - Ruby Version (USA, Europe) (Rev 1)'],
  ['aeac73e6', 'AXVE', 2, 'Pokemon - Ruby Version (USA, Europe) (Rev 2)'],
  ['690fd310', 'AXVF', 0, 'Pokemon - Version Rubis (France)'],
  ['9f981f72', 'AXVF', 1, 'Pokemon - Version Rubis (France) (Rev 1)'],
  ['15e1e280', 'AXVD', 0, 'Pokemon - Rubin-Edition (Germany)'],
  ['cae89464', 'AXVD', 1, 'Pokemon - Rubin-Edition (Germany) (Rev 1)'],
  ['c18231a9', 'AXVI', 0, 'Pokemon - Versione Rubino (Italy)'],
  ['9305e793', 'AXVI', 1, 'Pokemon - Versione Rubino (Italy) (Rev 1)'],
  ['eb0729cf', 'AXVS', 0, 'Pokemon - Edicion Rubi (Spain)'],
  ['b980fff5', 'AXVS', 1, 'Pokemon - Edicion Rubi (Spain) (Rev 1)'],
  ['fd1eeb78', 'AXPJ', 0, 'Pocket Monsters - Sapphire (Japan)'],
  ['01bd60e3', 'AXPJ', 1, 'Pocket Monsters - Sapphire (Japan) (Rev 1)'],
  ['554dedc4', 'AXPE', 0, 'Pokemon - Sapphire Version (USA, Europe)'],
  ['bafedae5', 'AXPE', 1, 'Pokemon - Sapphire Version (USA, Europe) (Rev 1)'],
  ['9cc4410e', 'AXPE', 2, 'Pokemon - Sapphire Version (USA, Europe) (Rev 2)'],
  ['3581a05f', 'AXPF', 0, 'Pokemon - Version Saphir (France)'],
  ['2ae49146', 'AXPF', 1, 'Pokemon - Version Saphir (France) (Rev 1)'],
  ['6fcd7a98', 'AXPD', 0, 'Pokemon - Saphir-Edition (Germany)'],
  ['b0c40c7c', 'AXPD', 1, 'Pokemon - Saphir-Edition (Germany) (Rev 1)'],
  ['0c7992a9', 'AXPI', 0, 'Pokemon - Versione Zaffiro (Italy)'],
  ['5efe4493', 'AXPI', 1, 'Pokemon - Versione Zaffiro (Italy) (Rev 1)'],
  ['a04f5f0b', 'AXPS', 0, 'Pokemon - Edicion Zafiro (Spain)'],
  ['f2c88931', 'AXPS', 1, 'Pokemon - Edicion Zafiro (Spain) (Rev 1)'],
  ['4881f3f8', 'BPEJ', 0, 'Pocket Monsters - Emerald (Japan)'],
  ['1f1c08fb', 'BPEE', 0, 'Pokemon - Emerald Version (USA, Europe)'],
  ['a3fdccb1', 'BPEF', 0, 'Pokemon - Version Emeraude (France)'],
  ['34c9df89', 'BPED', 0, 'Pokemon - Smaragd-Edition (Germany)'],
  ['a0aec80a', 'BPEI', 0, 'Pokemon - Versione Smeraldo (Italy)'],
  ['8c4d3108', 'BPES', 0, 'Pokemon - Edicion Esmeralda (Spain)'],
  ['3b2056e9', 'BPRJ', 0, 'Pocket Monsters - FireRed (Japan)'],
  ['bb640df7', 'BPRJ', 1, 'Pocket Monsters - FireRed (Japan) (Rev 1)'],
  ['dd88761c', 'BPRE', 0, 'Pokemon - FireRed Version (USA, Europe)'],
  ['84ee4776', 'BPRE', 1, 'Pokemon - FireRed Version (USA, Europe) (Rev 1)'],
  ['5dc668f6', 'BPRF', 0, 'Pokemon - Version Rouge Feu (France)'],
  ['1a81eedf', 'BPRD', 0, 'Pokemon - Feuerrote Edition (Germany)'],
  ['73a72167', 'BPRI', 0, 'Pokemon - Versione Rosso Fuoco (Italy)'],
  ['9f08064e', 'BPRS', 0, 'Pokemon - Edicion Rojo Fuego (Spain)'],
  ['0a48556b', 'BPGJ', 0, 'Pocket Monsters - LeafGreen (Japan)'],
  ['8da4601a', 'BPGJ', 1, 'Pocket Monsters - LeafGreen (Japan) (Rev 1)'],
  ['d69c96cc', 'BPGE', 0, 'Pokemon - LeafGreen Version (USA, Europe)'],
  ['daffecec', 'BPGE', 1, 'Pokemon - LeafGreen Version (USA, Europe) (Rev 1)'],
  ['ba3285e3', 'BPGF', 0, 'Pokemon - Version Vert Feuille (France)'],
  ['d12f1fdd', 'BPGD', 0, 'Pokemon - Blattgruene Edition (Germany)'],
  ['16974506', 'BPGI', 0, 'Pokemon - Versione Verde Foglia (Italy)'],
  ['2ca11d59', 'BPGS', 0, 'Pokemon - Edicion Verde Hoja (Spain)'],
];

const KNOWN = new Map<string, PokemonRom>(KNOWN_DUMPS.map(([crc32, code, revision, name]) => [crc32, {
  crc32,
  code,
  revision,
  name,
  game: GAMES[code.slice(0, 3)],
  language: LANGUAGES[code[3]],
}]));

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): string {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
}

/** The game code in a GBA cartridge header, or '' when the file is too short to have one. */
export function headerCode(rom: Uint8Array): string {
  if (rom.length < 0xC0) return '';
  return String.fromCharCode(rom[0xAC], rom[0xAD], rom[0xAE], rom[0xAF]);
}

export function identifyRom(rom: Uint8Array): RomCheck {
  const known = KNOWN.get(crc32(rom));
  if (known) return { ok: true, rom: known };
  const game = GAMES[headerCode(rom).slice(0, 3)];
  return game ? { ok: false, reason: 'unknownDump', game } : { ok: false, reason: 'notPokemon' };
}

/** A known dump by its CRC-32. */
export function knownRom(crc: string): PokemonRom | undefined {
  return KNOWN.get(crc);
}

/** "Pokémon FireRed", with the language for anything but English. */
export function romTitle(rom: PokemonRom): string {
  const title = 'Pokémon ' + rom.game;
  return rom.language === 'English' ? title : `${title} (${rom.language})`;
}
