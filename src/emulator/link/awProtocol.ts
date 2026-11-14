/**
 * Advance Wars 1 and 2 expect a protocol-correct word from every player in every transfer, so
 * the words can't be relayed over a network. The proxy stands in for the other players' GBAs: it
 * answers every transfer at once from what it knows of them, and only whole packets and presses
 * cross the network. The games poll at that level, so latency delays them but never breaks a
 * transfer.
 *
 * The game's own words drive three phases:
 *   PacketXg   packets: the names when the link starts, the settings, and a match's moves
 *   Sync       a barrier: everyone repeats the sync word until all players have reached it
 *   Intersync  the players' keys on the screens they go through together (words 0x8000-0x9F00:
 *              the low 10 bits are the keys, so a press is a run of words that ends with one
 *              whose low 10 bits are clear)
 *
 * The words for a transfer are staged one transfer ahead, before the game's word in it is
 * known, as a GBA sets its own word before the transfer starts.
 *
 * The rules are the games' own: what starts a packet, a game that gives a packet up, a game at
 * the barrier that is still owed packets, and what counts as a step of the key exchange. There
 * are up to four players: one queue per other player, replayed in that player's slot.
 */

export const CMD_NONE = 0x7FFF;
export const CMD_NOP = 0x5FFF;

/** "MAW1", the header of gpSP's Advance Wars netplay packets. */
export const MAW1_MAGIC = [0x4D, 0x41, 0x57, 0x31];

export enum AwState {
  PacketXg = 0,
  Sync = 1,
  Intersync = 2,
}

export enum GameVariant {
  Aw1 = 1,
  Aw2 = 2,
}

/** The word a game repeats at the sync barrier. */
export function syncWord(variant: GameVariant): number {
  return variant === GameVariant.Aw2 ? 0x9ABC : 0x5678;
}

/** Checksum words between a packet's size and its data. */
export function checksumWords(variant: GameVariant): number {
  return variant === GameVariant.Aw2 ? 2 : 1;
}

/** A packet is this word, its size, the checksum words and as many data words as the size says. */
const PACKET_START = 0x4FFF;
/** The games take a size above this for no packet at all. */
const MAX_PACKET_SIZE = 0x80;
/** A frame's word count travels in 8 bits. */
const MAX_FRAME_WORDS = 255;
/** Words of one player that wait to be replayed to the game. */
const REPLAY_QUEUE_WORDS = 4096;
/** A repeated state announcement is sent again this often, so the others still hear from us. */
const KEEPALIVE_MS = 250;

/*
 * A press that lasts is sent in parts of this many transfers (one a frame), so it has no longest
 * length. Every part but the last has KEYS_CONTINUE for its command. The replay of such a press
 * starts a little late, so that its next part is there in time, and its keys stay held if a
 * part is late all the same.
 */
const LONG_PRESS_PART = 120;
const KEYS_CONTINUE = 0xFFFE;
const LONG_PRESS_LEAD = 30;
const LONG_PRESS_PATIENCE = 600;

export interface AwFrame {
  cmd: number;
  state: number;
  words: readonly number[];
}

/** A frame as bytes: the magic, then (cmd << 16) | (state << 8) | count and the words, big-endian. */
export function maw1Serialize(frame: AwFrame): number[] {
  const count = frame.words.length;
  const out = [...MAW1_MAGIC, (frame.cmd >> 8) & 0xFF, frame.cmd & 0xFF, frame.state & 0xFF, count & 0xFF];
  for (const word of frame.words) out.push((word >> 8) & 0xFF, word & 0xFF);
  return out;
}

/**
 * Puts frames back together from a byte stream. The stream arrives in packets whose unused tail
 * is zero; zeros never match the magic, so the parser finds the next frame by itself.
 */
export class Maw1StreamParser {
  private magicIndex = 0;
  private header: number[] = [];
  private count = 0;
  private payload: number[] = [];

  constructor(private readonly onFrame: (frame: AwFrame) => void) {}

  push(data: ArrayLike<number>, start = 0): void {
    for (let i = start; i < data.length; i++) this.pushByte(data[i] & 0xFF);
  }

  private pushByte(b: number): void {
    if (this.magicIndex < 4) {
      if (b === MAW1_MAGIC[this.magicIndex]) this.magicIndex++;
      else this.magicIndex = b === MAW1_MAGIC[0] ? 1 : 0;
      return;
    }
    if (this.header.length < 4) {
      this.header.push(b);
      if (this.header.length === 4) {
        this.count = this.header[3];
        this.payload = [];
        if (this.count === 0) this.finish();
      }
      return;
    }
    this.payload.push(b);
    if (this.payload.length === 2 * this.count) this.finish();
  }

  private finish(): void {
    const words: number[] = [];
    for (let i = 0; i < this.count; i++) words.push((this.payload[2 * i] << 8) | this.payload[2 * i + 1]);
    const frame = { cmd: (this.header[0] << 8) | this.header[1], state: this.header[2], words };
    this.magicIndex = 0;
    this.header = [];
    this.onFrame(frame);
  }
}

type ParseState = 'commands' | 'packetHeader' | 'packetBody';

/** Words of another player that the game hasn't been given yet: a packet as its GBA sent it, or the keys of a press. */
interface QueuedWords {
  keys: boolean;
  words: readonly number[];
  /** Keys: the press goes on in the next entry. */
  continues: boolean;
}

/** What is known of another player's GBA, and what it sent that waits to be replayed. */
class Peer {
  state: number = AwState.PacketXg;
  /** 0: never heard from. */
  lastHeardMs = 0;
  queue: QueuedWords[] = [];
  /** Words of the first entry that the game has been given. */
  position = 0;
  /** A press was just replayed to its end: its keys are released for one transfer. */
  released = false;
  /** The key word of a long press whose next part is awaited, 0 otherwise. */
  held = 0;
  heldFor = 0;
  /** Transfers a long press has waited for its replay to start. */
  lead = 0;

  get queuedWords(): number {
    return this.queue.reduce((sum, entry) => sum + entry.words.length, 0);
  }
}

export class AwProxy {
  /** The local game's phase. */
  state: AwState = AwState.PacketXg;
  /** The other players' words for the next transfer, in seat order. */
  staged: number[];
  /** The other players, in seat order. */
  readonly peers: Peer[];

  private readonly sync: number;
  private readonly checksums: number;
  private parse: ParseState = 'commands';
  /** The game repeats the sync word while packets of the others still wait to be replayed to it. */
  private atBarrier = false;
  /** The packet or the press the game is sending. */
  private accum: number[] = [];
  /** Words of the packet being sent that follow its size. */
  private bodyWords = 0;
  /** Sync words in a row inside a packet. */
  private syncRun = 0;
  /** The game's last key word: its step is what the other players are shown at when they press nothing. */
  private lastCommand = 0;
  /** The game's keys of the last transfer and of the one before, as it counts them. */
  private held = 0;
  private heldBefore = 0;

  private lastSentState = -1;
  private lastSentMs = 0;

  /**
   * gbaIsParent: the game clocks the transfers itself (seat 0). gpSP runs a parent and a child
   * game through two functions; of their differences two are kept: a child's word that leaves
   * the sync barrier for packets is handled again as one, and only a parent has to be between
   * packets to be told that another player waits at the sync barrier.
   */
  constructor(variant: GameVariant, private readonly gbaIsParent: boolean, peerCount: number,
              private readonly emit: (frame: AwFrame) => void) {
    this.sync = syncWord(variant);
    this.checksums = checksumWords(variant);
    this.peers = Array.from({ length: peerCount }, () => new Peer());
    this.staged = new Array(peerCount).fill(CMD_NONE);
  }

  /** A finished transfer with the game's word: follows the game and stages the next transfer. */
  onRound(word: number, nowMs: number): void {
    if (this.state === AwState.Sync) {
      if (word === CMD_NONE) {
        this.leaveKeys();
        if (!this.gbaIsParent) this.handlePacketXg(word, nowMs);
      } else {
        // Any other word: the game saw everyone at the barrier and goes on to exchange keys
        const passed = word !== this.sync && word !== CMD_NOP;
        if (passed) this.enterIntersync();
        this.emitFrame(0, passed ? AwState.Intersync : AwState.Sync, [], nowMs);
        if (passed) this.handleIntersync(word, nowMs);
      }
    } else if (this.state === AwState.Intersync) {
      this.handleIntersync(word, nowMs);
    } else {
      this.handlePacketXg(word, nowMs);
    }
    this.stageNext();
  }

  /** A frame from another player. */
  applyNetFrame(peerIndex: number, frame: AwFrame, nowMs: number): void {
    const peer = this.peers[peerIndex];
    if (!peer) return;
    peer.state = frame.state;
    peer.lastHeardMs = nowMs || 1;
    const count = frame.words.length;
    // A frame without words only announces the player's state
    if (count === 0 || peer.queuedWords + count >= REPLAY_QUEUE_WORDS) return;
    if (frame.state === AwState.Intersync) {
      // Keys are for a game that exchanges keys, or waits at the barrier for the screens to come
      if (this.state === AwState.PacketXg && !this.atBarrier) return;
      peer.queue.push({ keys: true, words: frame.words, continues: frame.cmd === KEYS_CONTINUE });
    } else if (frame.state === AwState.PacketXg && count >= 2) {
      // Replayed as the player's GBA sent it: the start word, then the size, the checksum and the data
      peer.queue.push({ keys: false, words: [frame.cmd, ...frame.words], continues: false });
    }
  }

  private handleIntersync(word: number, nowMs: number): void {
    if (word === CMD_NOP) {
      // The game had no word ready: a transfer without it counts for nobody, and the game goes
      // on with every player's keys of the transfer before the last. For the others that is so
      // for this game's keys
      if (this.lastCommand) this.keyWord((this.lastCommand & 0xFC00) | (this.heldBefore & 0x3FF), nowMs);
    } else if (word >= 0x8000 && word <= 0x9F00 && word !== this.sync) {
      this.keyWord(word, nowMs);
      this.lastCommand = word;
    } else {
      // The game is back to packets, and this is the first word of them: a packet's start, or the
      // sync word (Advance Wars 2's looks like a key word, with keys no GBA can press together)
      this.leaveKeys();
      this.handlePacketXg(word, nowMs);
    }
  }

  /** The game's keys of one transfer: a press is collected until the keys are released. */
  private keyWord(word: number, nowMs: number): void {
    this.heldBefore = this.held;
    this.held = word;
    if (word & 0x3FF) {
      this.accum.push(word);
      // The last part of a press keeps two words
      if (this.accum.length === LONG_PRESS_PART + 2) {
        this.emitFrame(KEYS_CONTINUE, AwState.Intersync, this.accum.slice(0, LONG_PRESS_PART), nowMs);
        this.accum = this.accum.slice(LONG_PRESS_PART);
      }
    } else {
      // The keys are released: the press goes out
      this.emitFrame(this.lastCommand, AwState.Intersync, this.accum, nowMs);
      this.accum = [];
    }
  }

  /** The game is done with the screens its keys were for: what is left of the others' keys came too late. */
  private leaveKeys(): void {
    this.state = AwState.PacketXg;
    for (const peer of this.peers) {
      peer.queue = peer.queue.filter(entry => !entry.keys);
      peer.position = 0;
      peer.released = false;
      peer.held = 0;
      peer.lead = 0;
    }
  }

  private enterIntersync(): void {
    this.state = AwState.Intersync;
    this.atBarrier = false;
    this.accum = [];
    this.held = this.heldBefore = 0;
    // Packets still queued were sent before their player reached the barrier: repeats the game no longer reads
    for (const peer of this.peers) {
      peer.queue = peer.queue.filter(entry => entry.keys);
      peer.position = 0;
    }
  }

  /** True when the game left a packet unfinished to wait at the sync barrier: it repeats the sync word (a child with CMD_NOP in between). */
  private packetGivenUp(word: number): boolean {
    if (word === this.sync) this.syncRun++;
    else if (word !== CMD_NOP || this.syncRun === 0) this.syncRun = 0;
    if (this.syncRun < 2) return false;
    this.syncRun = 0;
    return true;
  }

  private handlePacketXg(word: number, nowMs: number): void {
    if (this.parse !== 'commands' && this.packetGivenUp(word)) {
      this.accum = [];
      this.parse = 'commands';
    }
    switch (this.parse) {
      case 'commands':
        if (word === PACKET_START) {
          this.atBarrier = false;
          this.syncRun = 0;
          this.parse = 'packetHeader';
        } else if (word === this.sync) {
          if (this.peers.every(peer => peer.queue.every(entry => entry.keys))) {
            // The barrier is only entered once the game has been given everyone's packets
            this.atBarrier = false;
            this.state = AwState.Sync;
          } else {
            // The others are told at once, as on a cable: a leader repeats its last packets until it
            // sees everyone at the barrier, so waiting for its packets to run out could wait forever
            this.atBarrier = true;
            this.emitFrame(0, AwState.Sync, [], nowMs);
          }
        } else if (word === CMD_NOP && this.atBarrier) {
          // A child's game sends this between two sync words
        } else if (this.atBarrier && word >= 0x8000 && word <= 0x9F00) {
          // The game saw everyone at the barrier in the words it was still being given, and exchanges keys already
          this.enterIntersync();
          this.emitFrame(0, AwState.Intersync, [], nowMs);
          this.handleIntersync(word, nowMs);
        } else {
          this.atBarrier = false;
          this.emitFrame(word, AwState.PacketXg, [], nowMs);
        }
        break;
      case 'packetHeader': {
        // The size, signed. A game that drops what it was about to send leaves a start word that
        // only idle words follow: no packet, and the word is looked at again for what else it is
        const size = (word << 16) >> 16;
        if (size > MAX_PACKET_SIZE) {
          this.parse = 'commands';
          this.handlePacketXg(word, nowMs);
          break;
        }
        this.accum = [word];
        this.bodyWords = Math.max(size, 0) + this.checksums;
        this.parse = 'packetBody';
        break;
      }
      case 'packetBody':
        // By count, as the games take it: nothing inside a packet ends it early
        this.accum.push(word);
        if (this.accum.length === this.bodyWords + 1) {
          this.parse = 'commands';
          this.emitFrame(PACKET_START, AwState.PacketXg, this.accum, nowMs);
        }
        break;
    }
  }

  private stageNext(): void {
    for (let i = 0; i < this.peers.length; i++) {
      const peer = this.peers[i];
      switch (this.state) {
        case AwState.Sync:
          this.staged[i] = peer.state >= AwState.Sync ? this.sync : CMD_NONE;
          break;
        case AwState.Intersync:
          // Without keys of the player, the step of the game's last word is echoed
          this.staged[i] = this.replayKeys(peer) || (this.lastCommand & 0xFC00);
          break;
        default:
          this.staged[i] = this.replayPacket(peer);
      }
    }
  }

  /** The next word of the player's queued keys, 0 without any. */
  private replayKeys(peer: Peer): number {
    // Two presses that arrive together must not run into one long press
    if (peer.released) {
      peer.released = false;
      return 0;
    }
    const entry = peer.queue[0];
    // A packet is for after the keys: its player has gone on already
    if (!entry || !entry.keys) {
      if (!peer.held) return 0;
      if (++peer.heldFor > LONG_PRESS_PATIENCE) peer.held = 0;
      return peer.held;
    }
    if (peer.position === 0 && entry.continues && !peer.held && peer.lead < LONG_PRESS_LEAD) {
      peer.lead++;
      return 0;
    }
    const word = entry.words[peer.position++];
    if (peer.position === entry.words.length) {
      peer.queue.shift();
      peer.position = 0;
      peer.lead = 0;
      peer.heldFor = 0;
      peer.held = entry.continues ? word : 0;
      peer.released = !entry.continues;
    }
    return word;
  }

  /**
   * The next word of the player's queued packets, each followed by one CMD_NONE. Without any:
   * the sync word while the player waits at the barrier, else CMD_NONE.
   */
  private replayPacket(peer: Peer): number {
    // Keys in the queue are for the screens after the barrier, from a player who is through it
    // already; a game that left the barrier again won't get there
    if (!this.atBarrier && peer.queue[0]?.keys) peer.queue = peer.queue.filter(queued => !queued.keys);
    const entry = peer.queue[0];
    if (!entry || entry.keys) {
      const betweenPackets = !this.gbaIsParent || this.parse === 'commands';
      // A player who is through the barrier already was at it: a game still waiting there sees it so
      const waits = peer.state === AwState.Sync || (this.atBarrier && peer.state === AwState.Intersync);
      return betweenPackets && waits ? this.sync : CMD_NONE;
    }
    if (peer.position < entry.words.length) return entry.words[peer.position++];
    peer.queue.shift();
    peer.position = 0;
    return CMD_NONE;
  }

  private emitFrame(cmd: number, state: number, words: readonly number[], nowMs: number): void {
    if (words.length > MAX_FRAME_WORDS) return;
    // The game announces its state in every idle transfer; the others only need to hear a change, and that we are still there
    if (words.length === 0 && state === this.lastSentState && nowMs - this.lastSentMs < KEEPALIVE_MS) return;
    this.lastSentState = state;
    this.lastSentMs = nowMs;
    this.emit({ cmd, state, words: words.slice() });
  }
}
