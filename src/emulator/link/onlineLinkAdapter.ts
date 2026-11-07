/**
 * The GB-Link firmware's GBA online mode (0x01) for an emulated GBA, part 2: what the
 * client sees of the adapter. Ported from the firmware's LinkModule and UsbSection: the
 * statuses, the commands, the data packets of the game's commands and the reconnects
 * between link sessions. To the client and the server an emulated GBA is the same as a
 * GBA on a GB-Link, as the parent (seat 0) or as a child.
 */
import {Observable, Subject} from 'rxjs';
import {Command, CommandType, DATA_ARRAY_LENGTH, DataArray, LinkMode, LinkStatus, PlayerSettingsCommand, SetModeCommand} from '../../shared/linkExchange/common';
import {GbaLinkPort, LinkRole} from './gbaLinkPort';
import {
  COMMAND_WORDS, LINK_MASTER_HANDSHAKE, LINK_SLAVE_HANDSHAKE, NextTransmit, PacketLayer, SEAT_BLOCK_SIZE, SeatQueues,
  TIMING_BETWEEN_COMMANDS, TIMING_COMMAND_BYTES, TIMING_HANDSHAKE
} from './packetLayer';

const LINKCMD_SEND_HELD_KEYS = 0xCAFE;
const LINKCMD_READY_CLOSE_LINK = 0x5FFF;
const LINK_KEY_CODE_EMPTY = 0x11;
const LINK_KEY_CODE_EXIT_ROOM = 0x17;

/** Seat blocks per data packet. */
const BUFFERED_BLOCKS = 3;
const RECONNECT_DELAY_MS = 400;
/** How long a parent game's last window is waited for after its link closed. */
const DISABLE_TIMEOUT_MS = 100;

/*
 * As the parent the link clocks the game the way a GBA parent does, in the game's own time: one handshake transfer a
 * frame, and once linked one window a frame, each transfer starting 197 x 64 cycles after the last one ended (Timer 3,
 * as the games set it). The adapter's gaps only come close to that, and a game that sends every frame overflows its
 * send queue on a link that runs slower than its frames.
 */
const FRAME_CYCLES = 280896;
const COMMAND_GAP_CYCLES = 197 * 64;
/** GBA cycles a transfer of 1-4 players takes at 115200 bps, as the emulator times it. */
const TRANSFER_CYCLES = [0, 3194, 6075, 8973, 11863];

type ModuleState = 'idle' | 'awaitPlayerSettings' | 'running';
type SectionPhase = 'awaitGbaHandshake' | 'awaitStartHandshake' | 'awaitConnect' | 'linked';

export class OnlineLinkAdapter {
  private readonly statusSubject = new Subject<LinkStatus>();
  private readonly dataSubject = new Subject<DataArray>();
  readonly status$: Observable<LinkStatus> = this.statusSubject.asObservable();
  readonly data$: Observable<DataArray> = this.dataSubject.asObservable();

  private state: ModuleState = 'idle';
  private seat = 0;
  private playerCount = 2;
  private readonly queues = new SeatQueues();
  private section: LinkSection | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private outbox: (() => void)[] = [];

  constructor(private readonly port: GbaLinkPort) {
    port.setTransferHandler(rx => this.section?.transferDone(rx));
  }

  /** True while the online mode runs, from SetMode until it closes. */
  get active(): boolean {
    return this.state !== 'idle';
  }

  /** A command for the adapter. Returns false for one an emulated GBA doesn't take. */
  command(command: Command): boolean {
    switch (command.type) {
      case CommandType.Cancel:
        this.stop();
        return true;
      case CommandType.SetMode:
        if ((command as SetModeCommand).mode !== LinkMode.onlineLink) return false;
        this.stop();
        this.state = 'awaitPlayerSettings';
        this.emitStatus(LinkStatus.DeviceReady);
        this.emitStatus(LinkStatus.AwaitPlayerSettings);
        return true;
      case CommandType.PlayerSettings: {
        const { playerCount, playerIndex } = command as PlayerSettingsCommand;
        if (playerCount < 2 || playerCount > 4 || playerIndex >= playerCount) return true;
        this.playerCount = playerCount;
        this.seat = playerIndex;
        if (this.state === 'awaitPlayerSettings') {
          this.state = 'running';
          this.startSection();
        }
        return true;
      }
      case CommandType.StartHandshake:
        this.section?.layer.enableHandshake();
        return true;
      case CommandType.ConnectLink:
        if (this.seat !== 0) this.section?.layer.connectHandshake();
        return true;
      default:
        return false;
    }
  }

  /** A data packet from the other players. */
  receive(data: ArrayLike<number>): void {
    if (this.state !== 'idle') this.queues.receive(data);
  }

  /** Ends the online mode, as a Cancel does. */
  stop(): void {
    if (this.state === 'idle') return;
    this.section?.end();
    this.section = null;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.state = 'idle';
    this.port.configure(LinkRole.None, 0, 2);
    this.emitStatus(LinkStatus.LinkClosed);
  }

  destroy(): void {
    this.stop();
    this.port.setTransferHandler(null);
  }

  private startSection(): void {
    this.section = new LinkSection(this, this.port, this.queues, this.seat, this.playerCount);
  }

  /** The section closed its link: the game left the room, or both sides closed for a new link. */
  sectionEnded(section: LinkSection, keepAlive: boolean): void {
    if (section !== this.section) return;
    this.section = null;
    if (!keepAlive) {
      this.stop();
      return;
    }
    this.emitStatus(LinkStatus.LinkReconnecting);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.state === 'running') this.startSection();
    }, RECONNECT_DELAY_MS);
  }

  emitStatus(status: LinkStatus): void {
    this.post(() => this.statusSubject.next(status));
  }

  emitData(data: DataArray): void {
    this.post(() => this.dataSubject.next(data));
  }

  // Sent after the current call returns: transfers finish inside the emulator's run
  private post(send: () => void): void {
    this.outbox.push(send);
    if (this.outbox.length > 1) return;
    queueMicrotask(() => {
      const sends = this.outbox;
      this.outbox = [];
      for (const s of sends) s();
    });
  }
}

/** One link session of the game, from its handshake until it closes the link (UsbSection). */
class LinkSection {
  readonly layer: PacketLayer;
  private phase: SectionPhase = 'awaitGbaHandshake';
  private current: NextTransmit;
  private ended = false;
  private draining = false;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly packets: number[] = new Array(DATA_ARRAY_LENGTH).fill(0);
  private waitingBlocks = 0;
  private noDirectionCommandStreak = 0;
  private keepAlive = true;
  private readyCloseLink = false;
  private readonly partnerReadyCloseLink = [false, false, false];

  constructor(private readonly adapter: OnlineLinkAdapter, private readonly port: GbaLinkPort, queues: SeatQueues,
              private readonly seat: number, private readonly playerCount: number) {
    queues.reset(seat, playerCount);
    this.layer = new PacketLayer(seat, playerCount, queues);
    this.layer.onHandshake = () => this.establish();
    this.layer.onWindow = (received, transmitted) => this.window(received, transmitted);
    port.configure(seat === 0 ? LinkRole.Parent : LinkRole.Child, seat, playerCount);
    this.current = this.layer.transmit();
    port.stage(this.slots(this.current.values));
    if (seat !== 0) port.clock(0);
  }

  transferDone(rx: number): void {
    if (this.ended) return;
    const done = this.current;
    this.layer.done(rx, done.values);
    if (this.ended) return;
    this.current = this.layer.transmit();
    this.port.stage(this.slots(this.current.values));
    if (this.seat !== 0) this.port.clock(this.gapCycles(done.timing));
  }

  /** GBA cycles from the end of a transfer to the start of the next, as the parent. */
  private gapCycles(timing: number): number {
    const players = this.playerCount - 2;
    const transfer = TRANSFER_CYCLES[this.playerCount];
    if (timing === TIMING_HANDSHAKE[players]) return FRAME_CYCLES - transfer;
    if (timing === TIMING_COMMAND_BYTES[players]) return COMMAND_GAP_CYCLES;
    if (timing === TIMING_BETWEEN_COMMANDS[players]) {
      // The rest of the frame after a checksum transfer and 8 command transfers
      return Math.max(0, FRAME_CYCLES - (COMMAND_WORDS + 1) * transfer - COMMAND_WORDS * COMMAND_GAP_CYCLES);
    }
    return 0;
  }

  /** Stops driving the game; packets still buffered go out. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.drainTimer !== null) clearTimeout(this.drainTimer);
    this.drainTimer = null;
    this.flush();
  }

  /**
   * Both sides closed the link (PacketLayer::awaitDisable). A parent game still gets its next
   * window answered, for at most 100 ms; a child's link stops at once.
   */
  private close(): void {
    this.flush();
    if (this.seat !== 0) {
      this.finish();
      return;
    }
    this.draining = true;
    this.drainTimer = setTimeout(() => this.finish(), DISABLE_TIMEOUT_MS);
  }

  private finish(): void {
    if (this.ended) return;
    this.end();
    this.adapter.sectionEnded(this, this.keepAlive);
  }

  /** The other players' words by slot. */
  private slots(values: number[]): number[] {
    const slots = [0xFFFF, 0xFFFF, 0xFFFF, 0xFFFF];
    let next = 0;
    for (let slot = 0; slot < this.playerCount; slot++) {
      if (slot === this.seat) continue;
      slots[slot] = values[next++] ?? 0xFFFF;
    }
    return slots;
  }

  /** Follows the handshake until the game is linked, reporting each step. */
  private establish(): void {
    const layer = this.layer;
    if (this.phase === 'awaitGbaHandshake') {
      if (layer.receivedHandshake !== LINK_SLAVE_HANDSHAKE) return;
      this.adapter.emitStatus(LinkStatus.HandshakeReceived);
      this.phase = 'awaitStartHandshake';
    }
    if (this.phase === 'awaitStartHandshake') {
      if (!layer.isHandshakeEnabled()) return;
      this.phase = 'awaitConnect';
    }
    if (this.phase === 'awaitConnect') {
      const connected = this.seat !== 0
        ? layer.transmittedHandshake[0] === LINK_MASTER_HANDSHAKE
        : layer.receivedHandshake === LINK_MASTER_HANDSHAKE;
      if (!connected) return;
      this.adapter.emitStatus(LinkStatus.LinkConnected);
      this.phase = 'linked';
    }
  }

  /** A finished command window: sends the game's command and watches for the link closing. */
  private window(received: number[], transmitted: number[][]): void {
    // The window after the link closed is only answered, its commands go nowhere
    if (this.draining) {
      this.finish();
      return;
    }
    this.bufferReceived(received);

    if (received[0] === LINKCMD_SEND_HELD_KEYS && received[1] === LINK_KEY_CODE_EXIT_ROOM) {
      this.keepAlive = false;
    }
    if (transmitted[0][0] === LINKCMD_SEND_HELD_KEYS && transmitted[1][0] === LINK_KEY_CODE_EXIT_ROOM) {
      this.keepAlive = false;
    }
    if (received[0] === LINKCMD_READY_CLOSE_LINK) {
      this.readyCloseLink = true;
    }
    for (let i = 0; i < this.playerCount - 1; i++) {
      if (transmitted[0][i] === LINKCMD_READY_CLOSE_LINK) this.partnerReadyCloseLink[i] = true;
    }
    // Only the partners actually in the session have to be ready
    const partnersReady = this.partnerReadyCloseLink.slice(0, this.playerCount - 1).every(ready => ready);
    if (this.readyCloseLink && partnersReady) this.close();
  }

  private bufferReceived(received: number[]): void {
    const offset = this.waitingBlocks * SEAT_BLOCK_SIZE;
    this.packets[offset] = this.seat;
    for (let i = 0; i < COMMAND_WORDS; i++) {
      this.packets[offset + 1 + i * 2] = received[i] & 0xFF;
      this.packets[offset + 2 + i * 2] = (received[i] >> 8) & 0xFF;
    }
    // Held keys with nothing pressed are only sent once, the rest would just load the connection
    if (received[0] === LINKCMD_SEND_HELD_KEYS && received[1] === LINK_KEY_CODE_EMPTY) {
      this.noDirectionCommandStreak++;
      if (this.noDirectionCommandStreak > 1) this.packets.fill(0, offset + 1, offset + 5);
    } else {
      this.noDirectionCommandStreak = 0;
    }
    this.waitingBlocks++;
    if (this.waitingBlocks === BUFFERED_BLOCKS) this.flush();
  }

  private flush(): void {
    if (this.waitingBlocks === 0) return;
    // Only the commands count, the seat byte is always set
    let empty = true;
    for (let i = 0; i < this.waitingBlocks && empty; i++) {
      const offset = i * SEAT_BLOCK_SIZE;
      for (let j = offset + 1; j < offset + SEAT_BLOCK_SIZE; j++) {
        if (this.packets[j] !== 0) {
          empty = false;
          break;
        }
      }
    }
    if (!empty) this.adapter.emitData(this.packets.slice() as DataArray);
    this.packets.fill(0);
    this.waitingBlocks = 0;
  }
}

