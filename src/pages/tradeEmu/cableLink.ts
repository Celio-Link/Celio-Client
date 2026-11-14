import {Subscription} from 'rxjs';
import {
  CancelCommand,
  CommandType, ConnectLinkCommand,
  DATA_ARRAY_LENGTH,
  DataArray,
  LinkMode,
  LinkStatus,
  PlayerSettingsCommand,
  StartHandshakeCommand
} from '../../shared/linkExchange/common';
import {LinkDeviceUtils} from '../../shared/linkDeviceUtils';
import {StatusEmitterAbstract} from '../../shared/linkExchange/statusEmitter/statusEmitter.abstract';

// Data frames carry three commands both ways, each a player index byte followed by 8 words
// (little-endian). The device plays one queued command per cable packet, zeros when none is
// queued, and reports the game's commands three packets at a time, skipping batches that are
// all zero.

export interface CablePartner {
  linkOpened(): void;
  linkClosed(): void;
  gameCommand(words: number[]): void;
  nextCommand(): number[] | null;
}

const CMD_WORDS = 8;
const CMD_BYTES = 1 + CMD_WORDS * 2;
const BATCH = DATA_ARRAY_LENGTH / CMD_BYTES;
const PLAYER_INDEX = 0;
// The device's packet period as master is 25.4 ms. Estimated long, its queue runs dry now and
// then rather than grow.
const PACKET_MS = 26;
const AHEAD = 6;                 // commands queued in the device at most
const CONNECT_DELAY_MS = 150;
const REOPEN_MS = 500;

export class CableLink {
  private readonly subscriptions = new Subscription();
  private readonly timeouts = new Set<ReturnType<typeof setTimeout>>();
  private pumpTimer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private entering = false;
  private connected = false;
  private since = 0;
  private sent = 0;

  /** device: a GB-Link or the emulator in the page; the link destroys it when it stops. */
  constructor(private readonly device: StatusEmitterAbstract, private readonly partner: CablePartner) {}

  async start() {
    this.running = true;
    this.subscriptions.add(this.device.status$().subscribe(status => this.onStatus(status)));
    this.subscriptions.add(this.device.data$().subscribe(data => this.onData(data)));
    this.pumpTimer = setInterval(() => this.pump(), 8);
    try {
      await this.enterMode();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.pumpTimer);
    this.timeouts.forEach(clearTimeout);
    this.timeouts.clear();
    this.subscriptions.unsubscribe();
    this.disconnected();
    try {
      await this.device.receiveCommand(new CancelCommand());
    } finally {
      this.device.destroy();
    }
  }

  private async enterMode() {
    this.entering = true;
    try {
      await LinkDeviceUtils.tryEnableLinkMode(this.device, LinkMode.onlineLink);
    } finally {
      this.entering = false;
    }
  }

  private onStatus(status: LinkStatus) {
    switch (status) {
      case LinkStatus.AwaitPlayerSettings:
        this.device.receiveCommand(new PlayerSettingsCommand(2, 1));
        break;
      case LinkStatus.HandshakeReceived:
        // The game opened its link: only now may the handshake commands go out.
        this.disconnected();
        this.partner.linkOpened();
        this.device.receiveCommand(new StartHandshakeCommand());
        this.later(CONNECT_DELAY_MS, () => this.device.receiveCommand(new ConnectLinkCommand()));
        break;
      case LinkStatus.LinkConnected:
        this.since = performance.now();
        this.sent = 0;
        this.connected = true;
        break;
      case LinkStatus.LinkReconnecting:
        this.disconnected();
        break;
      case LinkStatus.LinkClosed:
        // The game left the room, which ends the mode: enter it again for the next visit.
        this.disconnected();
        if (!this.entering) {
          this.later(REOPEN_MS, () => this.enterMode().catch(error => console.warn('Could not reopen the link mode', error)));
        }
        break;
    }
  }

  private disconnected() {
    this.connected = false;
    this.partner.linkClosed();
  }

  private later(ms: number, work: () => void) {
    const timeout = setTimeout(() => {
      this.timeouts.delete(timeout);
      if (this.running) work();
    }, ms);
    this.timeouts.add(timeout);
  }

  // Processed whenever running: the device sends a closing link's last commands before its
  // status, over another endpoint.
  private onData(data: DataArray) {
    for (let c = 0; c < BATCH; c++) {
      const at = c * CMD_BYTES + 1;
      const words = Array.from({length: CMD_WORDS}, (_, i) => data[at + i * 2] | (data[at + i * 2 + 1] << 8));
      if (words.some(word => word !== 0)) this.partner.gameCommand(words);
    }
  }

  // Keeps the device's queue at most AHEAD commands deep.
  private pump() {
    if (!this.connected) return;
    const played = Math.floor((performance.now() - this.since) / PACKET_MS);
    this.sent = Math.max(this.sent, played);
    while (this.sent - played + BATCH <= AHEAD) {
      const frame = new Array<number>(DATA_ARRAY_LENGTH).fill(0);
      for (let c = 0; c < BATCH; c++) {
        const at = c * CMD_BYTES;
        frame[at] = PLAYER_INDEX;
        this.partner.nextCommand()?.forEach((word, i) => {
          frame[at + 1 + i * 2] = word & 0xFF;
          frame[at + 2 + i * 2] = (word >> 8) & 0xFF;
        });
      }
      this.device.receiveData(frame as DataArray);
      this.sent += BATCH;
    }
  }
}
