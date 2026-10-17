import {StatusEmitterAbstract} from './statusEmitter.abstract';
import {Subscription} from 'rxjs';
import {Command, DataArray, LinkStatus} from '../common';
import {LinkDeviceService} from '../../../services/linkdevice.service';

export class StatusEmitterLinkDevice extends StatusEmitterAbstract {

  private subscriptions = new Subscription();

  constructor(private linkDeviceService: LinkDeviceService) {
    super();
    this.subscriptions.add(
      this.linkDeviceService
        .statusEvents$
        .subscribe((status) => {
          this.statusSubject.next(status)
        })
    );

    this.subscriptions.add(
      this.linkDeviceService
        .dataEvents$
        .subscribe((data) => {
          this.dataSubject.next(data)
        })
    );

  }

  receiveCommand(command: Command): Promise<boolean>  {
    return this.linkDeviceService.sendCommand(command);
  }

  receiveData(data: DataArray): Promise<boolean>  {
    return this.linkDeviceService.sendData(data)
  }

  destroy(): void {
    this.subscriptions.unsubscribe();
  }
}
