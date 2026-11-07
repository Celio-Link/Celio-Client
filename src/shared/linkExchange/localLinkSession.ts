import {Observable, Subject, Subscription} from 'rxjs';
import {ConnectLinkCommand, LinkStatus, PlayerSettingsCommand, StartHandshakeCommand} from './common';
import {StatusEmitterAbstract} from './statusEmitter/statusEmitter.abstract';

/**
 * A link between devices on this page, without a server: what the Celio server does for a session, here for the GBA
 * on a GB-Link and the emulator in the page. The seats go by the order the devices are given in; seat 0's game leads.
 */
export class LocalLinkSession {
  private readonly statuses: (LinkStatus | null)[];
  private linkConnected = 0;
  private readonly subscriptions = new Subscription();
  private readonly closedSubject = new Subject<void>();
  /** Every device closed its link: the games left the room. */
  readonly closed$: Observable<void> = this.closedSubject.asObservable();

  constructor(private readonly devices: StatusEmitterAbstract[]) {
    this.statuses = devices.map(() => null);
    devices.forEach((device, seat) => {
      this.subscriptions.add(device.status$().subscribe(status => this.onStatus(seat, status)));
      this.subscriptions.add(device.data$().subscribe(data => this.others(seat).forEach(other => other.receiveData(data))));
    });
  }

  destroy(): void {
    this.subscriptions.unsubscribe();
    this.devices.forEach(device => device.destroy());
  }

  private others(seat: number): StatusEmitterAbstract[] {
    return this.devices.filter((_, i) => i !== seat);
  }

  private onStatus(seat: number, status: LinkStatus): void {
    switch (status) {
      case LinkStatus.AwaitPlayerSettings:
        this.devices[seat].receiveCommand(new PlayerSettingsCommand(this.devices.length, seat));
        break;
      case LinkStatus.HandshakeReceived:
        this.statuses[seat] = status;
        if (this.statuses.every(s => s === LinkStatus.HandshakeReceived)) {
          this.devices.forEach(device => device.receiveCommand(new StartHandshakeCommand()));
        }
        break;
      case LinkStatus.LinkConnected:
        this.statuses[seat] = status;
        // Seat 0 connects first in every link-up, when its game leads: then the others follow it
        if (++this.linkConnected % this.devices.length === 1) {
          this.others(seat).forEach(device => device.receiveCommand(new ConnectLinkCommand()));
        }
        break;
      case LinkStatus.LinkReconnecting:
        this.statuses[seat] = status;
        break;
      case LinkStatus.LinkClosed:
        this.statuses[seat] = status;
        if (this.statuses.every(s => s === LinkStatus.LinkClosed)) this.closedSubject.next();
        break;
    }
  }
}
