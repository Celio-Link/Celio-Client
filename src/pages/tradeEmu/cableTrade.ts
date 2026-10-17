import type {CablePartner} from './cableLink';

// Player 0 of a Cable Club trade: the other Game Boy Advance in the Trade Center, the trade
// menu and the trade, as pokeemerald and pokefirered play them.
//
// The game opens a new link for each step of a visit: the Trade Center (link type 0x1133), the
// trade menu (0x1122), the trade (0x1144) and the room again after a cancelled menu (0x1111).
// Player 0 starts each link's LinkPlayer exchange with 0x2222. The game's LinkPlayer names the
// step, and this side answers with the same link type: a link-up only succeeds when all match.
// It answers as a game of the game's own region too: Emerald and FireRed/LeafGreen trade with
// each other only once both players are far enough in the story (GetGameProgressForLinkTrade).

export type TradePhase = 'linkup' | 'room' | 'menu' | 'trading';

export interface TradeParty {
  mons: Uint8Array[];      // encrypted 100-byte party structures, one to six
  selected: number;        // the Pokémon offered
}

export interface CableTradeEvents {
  phase?(phase: TradePhase | null): void;
  traded?(slot: number, received: Uint8Array): void;
  otherRoom?(): void;      // the game chose another room than the Trade Center
}

export interface CableTradeOptions {
  party(): TradeParty;
  events: CableTradeEvents;
}

const VERSION = {EMERALD: 3, FIRE_RED: 4, LEAF_GREEN: 5};

const LINKCMD = {
  SEND_LINK_TYPE: 0x2222, READY_EXIT_STANDBY: 0x2FFE, READY_CLOSE_LINK: 0x5FFF, CONT_BLOCK: 0x8888,
  INIT_BLOCK: 0xBBBB, SEND_HELD_KEYS: 0xCAFE, SEND_BLOCK_REQ: 0xCCCC,
};
// Trade menu and trade commands, the first word of a 20-byte block
const TRADECMD = {
  READY_TO_TRADE: 0xAABB, READY_FINISH_TRADE: 0xABCD, CONFIRM_TRADE: 0xBBBB, READY_CANCEL_TRADE: 0xBBCC,
  START_TRADE: 0xCCDD, CONFIRM_FINISH_TRADE: 0xDCBA, SET_MONS_TO_TRADE: 0xDDDD, PLAYER_CANCEL_TRADE: 0xDDEE,
  REQUEST_CANCEL: 0xEEAA, BOTH_CANCEL_TRADE: 0xEEBB,
};
const LINKTYPE = {TRADE: 0x1111, TRADE_CONNECTING: 0x1122, TRADE_SETUP: 0x1133, TRADE_DISCONNECTED: 0x1144};
const TRADE_LINK_TYPES = Object.values(LINKTYPE);
const KEY = {UP: 0x13, LEFT: 0x14, READY: 0x16, EXIT_ROOM: 0x17};
const REQUEST = {SIZE_200: 1, SIZE_100: 2, SIZE_220: 3, SIZE_40: 4};

// The trade menu's exchange: the parties two Pokémon at a time, then mail and gift ribbons
const PARTY_ROUNDS = [
  {request: REQUEST.SIZE_200, size: 200},
  {request: REQUEST.SIZE_200, size: 200},
  {request: REQUEST.SIZE_200, size: 200},
  {request: REQUEST.SIZE_220, size: 220},
  {request: REQUEST.SIZE_40, size: 40},
];

const CMD_WORDS = 8;
const BLOCK_CHUNK = 14;
const MAX_BLOCK = 256;
const MON_SIZE = 100;
const PARTY_BYTES = 6 * MON_SIZE;
const LINK_PLAYER_SIZE = 60;
const LP = 16;                    // the LinkPlayer inside its block, between the magic strings
const TRAINER_CARD_SIZE = 100;
const MENU_BLOCK_SIZE = 20;

// Cable packets (about 25 ms each), counted in calls to nextCommand
const ANNOUNCE_PACKETS = 10;
// After this side's last command of an exchange, before the next request: the game has to
// load its next block first, and a block that arrives before it resets its flags is lost.
const SETTLE_PACKETS = 20;
const ROUND_GAP_PACKETS = 15;
// The game moves a link partner a tile per 16 frames while its direction key is held, and
// ignores keys during a step
const STEP_PACKETS = 11;          // 16 frames, and up to one more until the next key
const WALK_DELAY_PACKETS = 20;    // from the game's first key in the room

const MAGIC = Array.from('GameFreak inc.', c => c.charCodeAt(0));
const NAME = [0xBD, 0xBF, 0xC6, 0xC3, 0xC9, 0xFF];   // "CELIO"
const TRAINER_ID = 11111;
const LANGUAGE_ENGLISH = 2;
// LinkPlayer progress flags, all set: the National Dex (0x0F), without which the game sends no
// Eggs or Pokémon from outside its regional Pokédex, and the story progress checked across
// the regions (0xF0)
const PROGRESS = 0x11;

interface Session {
  packets: number;
  idle: number;
  queue: number[][];
  waiting: {packets: number, run: () => void} | null;
  closing: boolean;
  received: {size: number, pos: number, data: Uint8Array} | null;
  linkType: number;
  mons: Uint8Array[];
  round: number;
  party: Uint8Array;
  offer: {slot: number, mon: Uint8Array} | null;
  inRoom: boolean;
  walk: {keys: number[], from: number} | null;
}

export class CableTradePartner implements CablePartner {
  private session: Session | null = null;
  private seated = false;
  private trade: {slot: number, mon: Uint8Array} | null = null;
  private currentPhase: TradePhase | null = null;

  constructor(private readonly options: CableTradeOptions) {}

  linkOpened() {
    this.session = {
      packets: 0, idle: 0, queue: [], waiting: null, closing: false, received: null, linkType: 0,
      mons: [], round: 0, party: new Uint8Array(PARTY_BYTES), offer: null, inRoom: false, walk: null,
    };
  }

  linkClosed() {
    this.session = null;
  }

  nextCommand(): number[] | null {
    const s = this.session;
    if (!s || s.closing) return null;
    s.packets++;
    if (s.packets === ANNOUNCE_PACKETS) s.queue.push(command(LINKCMD.SEND_LINK_TYPE, LINKTYPE.TRADE_SETUP));
    if (s.queue.length) {
      s.idle = 0;
    } else if (s.waiting && ++s.idle >= s.waiting.packets) {
      const run = s.waiting.run;
      s.waiting = null;
      run();
    }
    const next = s.queue.shift() ?? this.step(s);
    if (next?.[0] === LINKCMD.READY_CLOSE_LINK) s.closing = true;
    return next;
  }

  gameCommand(words: number[]) {
    const s = this.session;
    if (!s || s.closing) return;
    switch (words[0]) {
      case LINKCMD.INIT_BLOCK:
        s.received = words[1] > 0 && words[1] <= MAX_BLOCK
          ? {size: words[1], pos: 0, data: new Uint8Array(words[1] + BLOCK_CHUNK)} : null;
        break;
      case LINKCMD.CONT_BLOCK: {
        const received = s.received;
        if (!received) break;
        for (let i = 1; i < CMD_WORDS; i++) {
          received.data[received.pos++] = words[i] & 0xFF;
          received.data[received.pos++] = words[i] >> 8;
        }
        if (received.pos >= received.size) {
          s.received = null;
          this.block(s, received.data.slice(0, received.size));
        }
        break;
      }
      case LINKCMD.READY_EXIT_STANDBY:
        s.queue.push(command(LINKCMD.READY_EXIT_STANDBY));
        break;
      case LINKCMD.READY_CLOSE_LINK:
        s.waiting = null;
        s.walk = null;
        s.queue.push(command(LINKCMD.READY_CLOSE_LINK));
        break;
      case LINKCMD.SEND_HELD_KEYS:
        this.heldKey(s, words[1] & 0xFF);
        break;
    }
  }

  private block(s: Session, data: Uint8Array) {
    if (!s.linkType) {
      if (isLinkPlayer(data)) this.linkPlayer(s, data);
      return;
    }
    if (s.linkType === LINKTYPE.TRADE_CONNECTING) {
      if (s.round < PARTY_ROUNDS.length) this.partyBlock(s, data);
      else this.menuCommand(s, read16(data, 0), read16(data, 2));
    } else if (s.linkType === LINKTYPE.TRADE_DISCONNECTED && read16(data, 0) === TRADECMD.READY_FINISH_TRADE) {
      // The game has swapped the Pokémon and waits for player 0 to confirm.
      if (this.trade) this.options.events.traded?.(this.trade.slot, this.trade.mon);
      this.trade = null;
      s.queue.push(...menuBlock(TRADECMD.CONFIRM_FINISH_TRADE));
    }
  }

  private linkPlayer(s: Session, data: Uint8Array) {
    const linkType = read16(data, LP + 0x14);
    const version = versionFor(data[LP]);
    s.linkType = linkType;
    if (!TRADE_LINK_TYPES.includes(linkType)) {
      // Another link type makes the game report different selections and close the link.
      s.queue.push(...blockCommands(ownLinkPlayer(version, linkType ^ 0xFFFF), LINK_PLAYER_SIZE));
      this.options.events.otherRoom?.();
      return;
    }
    s.queue.push(...blockCommands(ownLinkPlayer(version, linkType), LINK_PLAYER_SIZE));
    switch (linkType) {
      case LINKTYPE.TRADE_SETUP:
        this.seated = false;
        this.trade = null;
        this.setPhase('linkup');
        s.waiting = {packets: SETTLE_PACKETS, run: () => this.request(s, REQUEST.SIZE_100, trainerCard(version), TRAINER_CARD_SIZE)};
        break;
      case LINKTYPE.TRADE_CONNECTING:
        s.mons = this.options.party().mons.slice(0, 6);
        s.waiting = {packets: SETTLE_PACKETS, run: () => this.partyRound(s)};
        break;
      case LINKTYPE.TRADE_DISCONNECTED:
        this.setPhase('trading');
        break;
    }
  }

  // Player 0's block request: every player sends the block of that size, player 0 included.
  private request(s: Session, type: number, data: Uint8Array, size: number) {
    s.queue.push(command(LINKCMD.SEND_BLOCK_REQ, type), ...blockCommands(data, size));
  }

  private partyRound(s: Session) {
    const round = PARTY_ROUNDS[s.round];
    const data = new Uint8Array(round.size);
    if (s.round < 3) {
      s.mons.slice(s.round * 2, s.round * 2 + 2).forEach((mon, i) => data.set(mon.subarray(0, MON_SIZE), i * MON_SIZE));
    }
    this.request(s, round.request, data, round.size);
  }

  private partyBlock(s: Session, data: Uint8Array) {
    if (data.length !== PARTY_ROUNDS[s.round].size) return;
    if (s.round < 3) s.party.set(data, s.round * 200);
    s.round++;
    if (s.round < PARTY_ROUNDS.length) s.waiting = {packets: ROUND_GAP_PACKETS, run: () => this.partyRound(s)};
    else this.setPhase('menu');
  }

  // The game as player 1 of the trade menu: player 0 decides on both players' choices.
  private menuCommand(s: Session, menuCommand: number, cursor: number) {
    switch (menuCommand) {
      case TRADECMD.READY_TO_TRADE: {
        const mon = s.party.slice(cursor * MON_SIZE, (cursor + 1) * MON_SIZE);
        if (cursor >= 6 || mon.every(b => b === 0)) return;
        const selected = this.options.party().selected;
        const slot = selected >= 0 && selected < s.mons.length ? selected : 0;
        s.offer = {slot, mon};
        s.queue.push(...menuBlock(TRADECMD.SET_MONS_TO_TRADE, slot));
        break;
      }
      case TRADECMD.CONFIRM_TRADE:
        if (!s.offer) return;
        this.trade = s.offer;
        s.offer = null;
        s.queue.push(...menuBlock(TRADECMD.START_TRADE));
        this.setPhase('trading');
        break;
      case TRADECMD.READY_CANCEL_TRADE:
        s.offer = null;
        s.queue.push(...menuBlock(TRADECMD.PLAYER_CANCEL_TRADE));
        break;
      case TRADECMD.REQUEST_CANCEL:
        s.offer = null;
        s.queue.push(...menuBlock(TRADECMD.BOTH_CANCEL_TRADE));
        break;
    }
  }

  // In the room the game reports its player's keys. This side's avatar walks to its chair on
  // the first visit, sits down when the player does and leaves when the player leaves.
  private heldKey(s: Session, key: number) {
    if (key === KEY.READY || key === KEY.EXIT_ROOM) {
      s.walk = null;
      s.queue.push(command(LINKCMD.SEND_HELD_KEYS, key));
      if (key === KEY.EXIT_ROOM) this.setPhase(null);
      return;
    }
    if (s.inRoom) return;
    s.inRoom = true;
    this.setPhase('room');
    if (!this.seated) {
      // From player 0's spot in the doorway to the left chair
      this.seated = true;
      s.walk = {keys: [KEY.UP, KEY.UP, KEY.LEFT, KEY.UP], from: s.packets + WALK_DELAY_PACKETS};
    }
  }

  // Each key is held from the middle of the step before to the middle of its own: the avatar
  // walks on without stopping and takes each step once.
  private step(s: Session): number[] | null {
    const walk = s.walk;
    if (!walk || s.packets < walk.from) return null;
    const held = Math.floor((s.packets - walk.from + STEP_PACKETS / 2) / STEP_PACKETS);
    if (held < walk.keys.length) return command(LINKCMD.SEND_HELD_KEYS, walk.keys[held]);
    s.walk = null;
    return null;
  }

  private setPhase(phase: TradePhase | null) {
    if (phase === this.currentPhase) return;
    this.currentPhase = phase;
    this.options.events.phase?.(phase);
  }
}

// A version of the game's region: FireRed for FireRed and LeafGreen, Emerald for Ruby,
// Sapphire and Emerald
function versionFor(gameVersion: number): number {
  return gameVersion === VERSION.FIRE_RED || gameVersion === VERSION.LEAF_GREEN ? VERSION.FIRE_RED : VERSION.EMERALD;
}

function ownLinkPlayer(version: number, linkType: number): Uint8Array {
  const block = new Uint8Array(LINK_PLAYER_SIZE);
  block.set(MAGIC, 0);
  block.set(MAGIC, LP + 28);
  write16(block, LP, 0x4000 | version);
  write16(block, LP + 0x02, 0x8000);
  write16(block, LP + 0x04, TRAINER_ID);
  block.set(NAME, LP + 0x08);
  block[LP + 0x10] = PROGRESS;
  block[LP + 0x12] = PROGRESS;
  write16(block, LP + 0x14, linkType);
  write16(block, LP + 0x1A, LANGUAGE_ENGLISH);
  return block;
}

function trainerCard(version: number): Uint8Array {
  const card = new Uint8Array(TRAINER_CARD_SIZE);
  card[0x02] = 1;               // has a Pokédex
  write16(card, 0x0E, TRAINER_ID);
  card.set(NAME, 0x30);
  card[0x38] = version;
  return card;
}

function isLinkPlayer(data: Uint8Array): boolean {
  return data.length >= LINK_PLAYER_SIZE && MAGIC.every((c, i) => data[i] === c && data[LP + 28 + i] === c);
}

function command(...words: number[]): number[] {
  return Array.from({length: CMD_WORDS}, (_, i) => words[i] ?? 0);
}

// INIT_BLOCK with the size and player 0's id, then the data seven words at a time
function blockCommands(data: Uint8Array, size: number): number[][] {
  const commands = [command(LINKCMD.INIT_BLOCK, size, 0x80)];
  for (let pos = 0; pos < size; pos += BLOCK_CHUNK) {
    const words = [LINKCMD.CONT_BLOCK];
    for (let at = pos; at < pos + BLOCK_CHUNK; at += 2) {
      words.push((at < size ? data[at] : 0) | (at + 1 < size ? data[at + 1] << 8 : 0));
    }
    commands.push(words);
  }
  return commands;
}

function menuBlock(menuCommand: number, argument = 0): number[][] {
  const data = new Uint8Array(MENU_BLOCK_SIZE);
  write16(data, 0, menuCommand);
  write16(data, 2, argument);
  return blockCommands(data, MENU_BLOCK_SIZE);
}

function read16(data: Uint8Array, at: number): number {
  return data[at] | (data[at + 1] << 8);
}

function write16(data: Uint8Array, at: number, value: number) {
  data[at] = value & 0xFF;
  data[at + 1] = (value >> 8) & 0xFF;
}
