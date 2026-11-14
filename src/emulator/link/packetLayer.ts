/**
 * The GB-Link firmware's GBA online mode (0x01) for an emulated GBA, part 1: the packet
 * layer that keeps the game in step with the other players, and the queues of the other
 * seats' commands. Ported from the firmware's layers/packet: PacketLayer and usbLinkCommand.
 *
 * Every transfer carries one word per player. During the handshake the link answers with
 * handshake words; once linked, the game exchanges 8-word commands, one word per transfer,
 * each 8-word window preceded by a checksum transfer.
 */

export const LINK_MASTER_HANDSHAKE = 0x8FFF;
export const LINK_SLAVE_HANDSHAKE = 0xB9A0;
export const LINK_HANDSHAKE_DISABLE = 0xD15E;

export const COMMAND_WORDS = 8;
/** A seat's command in a data packet: the seat, then the 8 words little-endian. */
export const SEAT_BLOCK_SIZE = 1 + COMMAND_WORDS * 2;

const QUEUE_DEPTH = 200;
const UNASSIGNED_SEAT = 0xFF;

/** Gaps the adapter leaves between transfers as the parent, in its PIO cycles (0.5425 µs), for 2, 3 and 4 players. */
export const TIMING_HANDSHAKE = [29868, 29551, 29282];
export const TIMING_COMMAND_BYTES = [1098, 1166, 1178];
export const TIMING_BETWEEN_COMMANDS = [12673, 9758, 7253];

/** The other players' words for the next transfer, and the gap after it as the parent. */
export interface NextTransmit {
  values: number[];
  timing: number;
}

/**
 * The queued commands of the other seats (usbLinkCommand). Queue i holds the i-th other
 * seat in ascending order, which is also the order of their slots.
 */
export class SeatQueues {
  private seats: number[] = [UNASSIGNED_SEAT, UNASSIGNED_SEAT, UNASSIGNED_SEAT];
  private queues: number[][][] = [[], [], []];
  private current: (number[] | null)[] = [null, null, null];
  private index = 0;
  private partners = 1;

  /** A new link section: assigns the seats and empties the queues. */
  reset(ownSeat: number, playerCount: number): void {
    let seat = 0;
    for (let i = 0; i < this.seats.length; i++) {
      if (seat === ownSeat) seat++;
      this.seats[i] = seat++;
      this.queues[i] = [];
      this.current[i] = null;
    }
    this.index = 0;
    this.partners = playerCount - 1;
  }

  /** A data packet from the other players: up to three seat blocks. */
  receive(data: ArrayLike<number>): void {
    for (let offset = 0; offset + SEAT_BLOCK_SIZE <= data.length; offset += SEAT_BLOCK_SIZE) {
      const queue = this.seats.indexOf(data[offset]);
      // Our own seat or an unknown one
      if (queue < 0) continue;
      if (this.queues[queue].length >= QUEUE_DEPTH) continue;
      const words: number[] = [];
      for (let i = 0; i < COMMAND_WORDS; i++) {
        words.push((data[offset + 1 + i * 2] & 0xFF) | (data[offset + 2 + i * 2] & 0xFF) << 8);
      }
      this.queues[queue].push(words);
    }
  }

  /** One word of each other seat's current command, 0 for a seat without one. */
  transmit(): number[] {
    const values: number[] = [];
    let shifted = false;
    for (let i = 0; i < this.partners; i++) {
      const command = this.current[i];
      if (!command) {
        values.push(0x0000);
        continue;
      }
      const word = command[this.index];
      shifted = true;
      // The firmware does this too (only seen on reconnects, from children to the parent)
      if (this.index === 0 && (word === 0xFF02 || word === 0xFF06 || word === 0xFF07)) {
        values.push(0x5FFF);
      } else {
        values.push(word);
      }
      if (this.index === COMMAND_WORDS - 1) this.current[i] = null;
    }
    if (shifted) this.index++;
    if (this.index === COMMAND_WORDS) this.index = 0;
    return values;
  }

  /** At the end of a command window: each seat's next command. */
  loadNext(): void {
    for (let i = 0; i < this.queues.length; i++) {
      this.current[i] = this.queues[i].shift() ?? null;
    }
  }
}

type TransiveState = 'crc' | 'command' | 'handshake';
type HandshakeState = 'disabled' | 'enabled' | 'connect';

export class PacketLayer {
  receivedHandshake = LINK_HANDSHAKE_DISABLE;
  transmittedHandshake: number[] = [];

  /** After every handshake transfer. */
  onHandshake: (() => void) | null = null;
  /** After every 8-word command window: the game's words and the other players' words per transfer. */
  onWindow: ((received: number[], transmitted: number[][]) => void) | null = null;

  private state: TransiveState = 'handshake';
  private handshakeState: HandshakeState = 'disabled';
  // The first checksum after the handshake is always the handshake word
  private crc = LINK_SLAVE_HANDSHAKE;
  private timing = 0;
  private commandIndex = 0;
  private receivedCommand: number[] = new Array(COMMAND_WORDS).fill(0);
  private transmitCommandIndex = 0;
  private transmittedCommand: number[][] = Array.from({ length: COMMAND_WORDS }, () => []);

  constructor(readonly seat: number, readonly playerCount: number, private queues: SeatQueues) {}

  enableHandshake(): void {
    this.handshakeState = 'enabled';
  }

  connectHandshake(): void {
    this.handshakeState = 'connect';
  }

  isHandshakeEnabled(): boolean {
    return this.transmittedHandshake[0] === LINK_SLAVE_HANDSHAKE;
  }

  /** The words for the next transfer. */
  transmit(): NextTransmit {
    switch (this.state) {
      case 'crc':
        return { values: this.transmitCrc(), timing: this.timing };
      case 'command':
        return { values: this.transmitCommand(), timing: this.timing };
      case 'handshake':
        return { values: this.transmitHandshake(), timing: this.timing };
    }
  }

  /** A finished transfer: the game's word and the words that went with it. */
  done(rx: number, tx: number[]): void {
    this.receive(rx);
    this.transiveDone(rx, tx);
  }

  private receive(rx: number): void {
    switch (this.state) {
      case 'crc':
        // The game's checksum isn't needed: the link sends its own
        break;
      case 'command':
        this.receivedCommand[this.commandIndex] = rx;
        this.crc = (this.crc + rx) & 0xFFFF;
        this.commandIndex++;
        break;
      case 'handshake':
        this.receivedHandshake = rx;
        break;
    }
  }

  private transmitHandshake(): number[] {
    const value = this.handshakeState === 'disabled' ? LINK_HANDSHAKE_DISABLE : LINK_SLAVE_HANDSHAKE;
    const values: number[] = [];
    for (let i = 0; i < this.playerCount - 1; i++) {
      values.push(this.handshakeState === 'connect' && i === 0 ? LINK_MASTER_HANDSHAKE : value);
    }
    return values;
  }

  private transmitCrc(): number[] {
    return new Array(this.playerCount - 1).fill(this.crc);
  }

  private transmitCommand(): number[] {
    const values = this.queues.transmit();
    this.transmittedCommand[this.transmitCommandIndex] = values;
    for (let i = 0; i < this.playerCount - 1; i++) {
      this.crc = (this.crc + values[i]) & 0xFFFF;
    }
    this.transmitCommandIndex++;
    return values;
  }

  private transiveDone(rx: number, tx: number[]): void {
    const players = this.playerCount - 2;
    switch (this.state) {
      case 'handshake':
        this.transmittedHandshake = tx;
        this.receivedHandshake = rx;
        this.timing = TIMING_HANDSHAKE[players];
        if (rx === LINK_MASTER_HANDSHAKE || tx[0] === LINK_MASTER_HANDSHAKE) {
          this.state = 'crc';
          this.timing = TIMING_COMMAND_BYTES[players];
        }
        this.onHandshake?.();
        break;

      case 'crc':
        this.state = 'command';
        this.crc = 0;
        break;

      case 'command': {
        if (this.commandIndex === COMMAND_WORDS - 1) {
          this.timing = TIMING_BETWEEN_COMMANDS[players];
        }
        if (this.commandIndex !== COMMAND_WORDS) return;
        this.commandIndex = 0;
        this.transmitCommandIndex = 0;
        this.state = 'crc';
        this.timing = TIMING_COMMAND_BYTES[players];
        const received = this.receivedCommand.slice();
        const transmitted = this.transmittedCommand.map(values => values.slice());
        this.queues.loadNext();
        this.onWindow?.(received, transmitted);
        break;
      }
    }
  }
}
