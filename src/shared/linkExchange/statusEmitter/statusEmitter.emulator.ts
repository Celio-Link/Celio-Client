import {StatusEmitterAbstract} from './statusEmitter.abstract';
import {Subscription} from 'rxjs';
import {Command, DataArray} from '../common';
import {LinkModeAdapter} from '../../../emulator/link/linkAdapter';

/** The in-browser emulator's link adapter as the link device. */
export class StatusEmitterEmulator extends StatusEmitterAbstract {

  private subscriptions = new Subscription();

  constructor(private adapter: LinkModeAdapter) {
    super();
    this.subscriptions.add(adapter.status$.subscribe(status => this.statusSubject.next(status)));
    this.subscriptions.add(adapter.data$.subscribe(data => this.dataSubject.next(data)));
  }

  receiveCommand(command: Command): Promise<boolean> {
    return Promise.resolve(this.adapter.command(command));
  }

  receiveData(data: DataArray): Promise<boolean> {
    this.adapter.receive(data);
    return Promise.resolve(true);
  }

  destroy(): void {
    this.subscriptions.unsubscribe();
  }
}
