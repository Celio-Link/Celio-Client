/**
 * The GB-Link adapter an emulated GBA is linked through: the firmware's link modes that run in
 * the page, GBA online (0x01) and Advance Wars (0x04). SetMode chooses the mode, as on the adapter.
 */
import {merge, Observable} from 'rxjs';
import {Command, CommandType, DataArray, LinkStatus} from '../../shared/linkExchange/common';
import {GbaLinkPort} from './gbaLinkPort';
import {OnlineLinkAdapter} from './onlineLinkAdapter';
import {AdvanceWarsLinkAdapter} from './advanceWarsLinkAdapter';

/** What the client sees of the adapter in one link mode. */
export interface LinkModeAdapter {
  readonly status$: Observable<LinkStatus>;
  readonly data$: Observable<DataArray>;
  /** True while the mode runs, from SetMode until it closes. */
  readonly active: boolean;
  /** A command for the adapter. Returns false for one the mode doesn't take. */
  command(command: Command): boolean;
  /** A data packet from the other players. */
  receive(data: ArrayLike<number>): void;
  /** Ends the mode, as a Cancel does. */
  stop(): void;
  destroy(): void;
}

export class LinkAdapter implements LinkModeAdapter {
  readonly status$: Observable<LinkStatus>;
  readonly data$: Observable<DataArray>;

  private readonly modes: LinkModeAdapter[];

  /** now: the clock for the link's timeouts, in ms; the page's own by default. */
  constructor(port: GbaLinkPort, now?: () => number) {
    this.modes = [new OnlineLinkAdapter(port), new AdvanceWarsLinkAdapter(port, now)];
    this.status$ = merge(...this.modes.map(mode => mode.status$));
    this.data$ = merge(...this.modes.map(mode => mode.data$));
  }

  get active(): boolean {
    return this.modes.some(mode => mode.active);
  }

  command(command: Command): boolean {
    switch (command.type) {
      case CommandType.Cancel:
        this.stop();
        return true;
      case CommandType.SetMode:
        // A new mode ends the one that runs
        this.stop();
        return this.modes.some(mode => mode.command(command));
      default:
        return this.modes.find(mode => mode.active)?.command(command) ?? false;
    }
  }

  receive(data: ArrayLike<number>): void {
    this.modes.find(mode => mode.active)?.receive(data);
  }

  stop(): void {
    for (const mode of this.modes) mode.stop();
  }

  destroy(): void {
    for (const mode of this.modes) mode.destroy();
  }
}
