import {Observable, Subject} from 'rxjs';
import {Command, CommandType, DATA_ARRAY_LENGTH, DataArray, LinkMode, LinkStatus, PlayerSettingsCommand, SetModeCommand} from '../../shared/linkExchange/common';
import {GbaLinkPort, LinkRole, TRANSFER_CYCLES} from './gbaLinkPort';
import {LinkModeAdapter} from './linkAdapter';
import {AwProxy, AwState, GameVariant, Maw1StreamParser, maw1Serialize} from './awProtocol';

const FRAME_CYCLES = 280896;
const PACKET_ROUND_CYCLES = FRAME_CYCLES / 2;
const SYNC_ROUND_CYCLES = FRAME_CYCLES + 1024;
/** Without a frame from a player for this long, the link is reported as reconnecting. */
const LINK_TIMEOUT_MS = 4000;

type ModuleState = 'idle' | 'awaitPlayerSettings' | 'awaitStart' | 'running';

export class AdvanceWarsLinkAdapter implements LinkModeAdapter {
  private readonly statusSubject = new Subject<LinkStatus>();
  private readonly dataSubject = new Subject<DataArray>();
  readonly status$: Observable<LinkStatus> = this.statusSubject.asObservable();
  readonly data$: Observable<DataArray> = this.dataSubject.asObservable();

  private state: ModuleState = 'idle';
  private variant = GameVariant.Aw1;
  private seat = 0;
  private playerCount = 2;
  private section: AwSection | null = null;
  private outbox: (() => void)[] = [];

  /** now: the clock the keepalives and the link timeout go by, in ms. */
  constructor(private readonly port: GbaLinkPort, private readonly now: () => number = () => performance.now()) {}

  get active(): boolean {
    return this.state !== 'idle';
  }

  command(command: Command): boolean {
    switch (command.type) {
      case CommandType.Cancel:
        this.stop();
        return true;
      case CommandType.SetMode: {
        const setMode = command as SetModeCommand;
        if (setMode.mode !== LinkMode.advanceWars) return false;
        this.stop();
        this.variant = setMode.variant === GameVariant.Aw2 ? GameVariant.Aw2 : GameVariant.Aw1;
        this.port.setTransferHandler(rx => this.section?.transferDone(rx));
        this.state = 'awaitPlayerSettings';
        this.emitStatus(LinkStatus.DeviceReady);
        this.emitStatus(LinkStatus.AwaitPlayerSettings);
        return true;
      }
      case CommandType.PlayerSettings: {
        const { playerCount, playerIndex } = command as PlayerSettingsCommand;
        if (playerCount < 2 || playerCount > 4 || playerIndex >= playerCount) return true;
        this.playerCount = playerCount;
        this.seat = playerIndex;
        if (this.state === 'awaitPlayerSettings') {
          this.state = 'awaitStart';
          this.emitStatus(LinkStatus.HandshakeReceived);
        }
        return true;
      }
      case CommandType.StartHandshake:
        if (this.state === 'awaitStart') {
          this.state = 'running';
          this.section = new AwSection(this, this.port, this.now, this.variant, this.seat, this.playerCount);
          this.emitStatus(LinkStatus.LinkConnected);
        }
        return true;
      case CommandType.ConnectLink:
        // The games link up through the proxy by themselves
        return true;
      default:
        return false;
    }
  }

  receive(data: ArrayLike<number>): void {
    this.section?.receive(data);
  }

  stop(): void {
    if (this.state === 'idle') return;
    this.section?.end();
    this.section = null;
    this.state = 'idle';
    this.port.configure(LinkRole.None, 0, 2);
    this.emitStatus(LinkStatus.LinkClosed);
  }

  destroy(): void {
    this.stop();
    this.port.setTransferHandler(null);
  }

  emitStatus(status: LinkStatus): void {
    this.post(() => this.statusSubject.next(status));
  }

  emitData(data: DataArray): void {
    this.post(() => this.dataSubject.next(data));
  }

  // Sent after the current call returns: transfers finish inside the emulator's run
  post(send: () => void): void {
    this.outbox.push(send);
    if (this.outbox.length > 1) return;
    queueMicrotask(() => {
      const sends = this.outbox;
      this.outbox = [];
      for (const s of sends) s();
    });
  }
}

/** The proxy at work, from StartHandshake until the mode ends (AwProtocolSection). */
class AwSection {
  private readonly proxy: AwProxy;
  /** The seats of the other players in ascending order, which is also the order of their slots. */
  private readonly peerSeats: number[] = [];
  private readonly parsers: Maw1StreamParser[];
  private outbound: number[] = [];
  private flushPending = false;
  private reportedReconnecting = false;
  private ended = false;

  constructor(private readonly adapter: AdvanceWarsLinkAdapter, private readonly port: GbaLinkPort,
              private readonly now: () => number, variant: GameVariant,
              private readonly seat: number, private readonly playerCount: number) {
    for (let s = 0; s < playerCount; s++) {
      if (s !== seat) this.peerSeats.push(s);
    }
    this.proxy = new AwProxy(variant, seat === 0, this.peerSeats.length, frame => {
      this.outbound.push(...maw1Serialize(frame));
    });
    this.parsers = this.peerSeats.map((_, peer) => new Maw1StreamParser(frame => {
      this.proxy.applyNetFrame(peer, frame, this.now());
    }));
    port.configure(seat === 0 ? LinkRole.Parent : LinkRole.Child, seat, playerCount);
    port.stage(this.slots());
    if (seat !== 0) port.clock(0);
  }

  transferDone(rx: number): void {
    if (this.ended) return;
    this.proxy.onRound(rx, this.now());
    this.port.stage(this.slots());
    if (this.seat !== 0) {
      const round = this.proxy.state >= AwState.Sync ? SYNC_ROUND_CYCLES : PACKET_ROUND_CYCLES;
      this.port.clock(round - TRANSFER_CYCLES[this.playerCount]);
    }
    this.supervise();
    if (this.outbound.length && !this.flushPending) {
      this.flushPending = true;
      this.adapter.post(() => this.flush());
    }
  }

  receive(data: ArrayLike<number>): void {
    if (this.ended) return;
    // A packet's first byte is its sender's seat
    const peer = this.peerSeats.indexOf(data[0]);
    if (peer >= 0) this.parsers[peer].push(data, 1);
  }

  end(): void {
    this.ended = true;
    this.outbound = [];
  }

  /** The other players' words by slot. */
  private slots(): number[] {
    const slots = [0xFFFF, 0xFFFF, 0xFFFF, 0xFFFF];
    this.peerSeats.forEach((seat, peer) => { slots[seat] = this.proxy.staged[peer]; });
    return slots;
  }

  /** The frames since the last packets, as packets. The rest of the last one is zero: frames start at a packet's start or after another frame. */
  private flush(): void {
    this.flushPending = false;
    if (this.ended) return;
    const room = DATA_ARRAY_LENGTH - 1;
    for (let offset = 0; offset < this.outbound.length; offset += room) {
      const packet = [this.seat, ...this.outbound.slice(offset, offset + room)];
      while (packet.length < DATA_ARRAY_LENGTH) packet.push(0);
      this.adapter.emitData(packet as DataArray);
    }
    this.outbound = [];
  }

  /** Reports a player who went quiet, and when everyone is heard again. The game is answered either way. */
  private supervise(): void {
    const now = this.now();
    const heard = this.proxy.peers.filter(peer => peer.lastHeardMs !== 0);
    if (!heard.length) return;
    const quiet = heard.some(peer => now - peer.lastHeardMs > LINK_TIMEOUT_MS);
    if (quiet === this.reportedReconnecting) return;
    this.reportedReconnecting = quiet;
    this.adapter.emitStatus(quiet ? LinkStatus.LinkReconnecting : LinkStatus.LinkConnected);
  }
}
