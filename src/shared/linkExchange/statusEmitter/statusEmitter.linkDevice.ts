import {StatusEmitterAbstract} from './statusEmitter.abstract';
import {Subscription} from 'rxjs';
import {CommandType, DataArray, LinkStatus} from '../common';
import {LinkDeviceService} from '../../../services/linkdevice.service';

export class StatusEmitterLinkDevice extends StatusEmitterAbstract {

  private subscriptions = new Subscription();

  constructor(private linkDeviceServe: LinkDeviceService) {
    super();
    this.subscriptions.add(
      this.linkDeviceServe
        .statusEvents$
        .subscribe((status) => {
          this.statusSubject.next(status)
        })
    );

    this.subscriptions.add(
      this.linkDeviceServe
        .dataEvents$
        .subscribe((data) => {
          this.dataSubject.next(data)
        })
    );

  }

  receiveCommand(command: CommandType, args: Uint8Array = new Uint8Array(0)): Promise<boolean>  {
    return this.linkDeviceServe.sendCommand(command, args);
  }

  receiveData(data: DataArray): Promise<boolean>  {
    return this.linkDeviceServe.sendData(data)
  }

  destroy(): void {
    this.subscriptions.unsubscribe();
  }
}
