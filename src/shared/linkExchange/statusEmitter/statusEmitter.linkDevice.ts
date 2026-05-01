import {StatusEmitterInterface} from './statusEmitter.interface';
import {Observable, Subject, Subscription} from 'rxjs';
import {CommandType, DataArray, LinkStatus} from '../common';
import {LinkDeviceService} from '../../../services/linkdevice.service';

export class StatusEmitterLinkDevice implements StatusEmitterInterface {

  private subscriptions = new Subscription();

  private readonly statusSubject = new Subject<LinkStatus>();
  private readonly dataSubject = new Subject<DataArray>();

  constructor(private linkDeviceServe: LinkDeviceService) {
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

  data$(): Observable<DataArray> {
    return this.dataSubject.asObservable();
  }

  status$(): Observable<LinkStatus> {
    return this.statusSubject.asObservable();
  }

  sendCommand(command: CommandType, args: Uint8Array = new Uint8Array(0)): Promise<boolean>  {
    return this.linkDeviceServe.sendCommand(command, args);
  }

  sendData(data: DataArray): Promise<boolean>  {
    return this.linkDeviceServe.sendData(data)
  }

  destroy(): void {
    this.subscriptions.unsubscribe();
  }
}
