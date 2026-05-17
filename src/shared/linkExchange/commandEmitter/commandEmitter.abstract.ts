import {Observable, Subject} from 'rxjs';
import {CommandPacket, DataPacket, StatusPacket} from '../common';

export abstract class CommandEmitterAbstract {

  protected readonly closeSubject = new Subject<void>();
  protected readonly commandSubject = new Subject<CommandPacket>();
  protected readonly dataSubject = new Subject<DataPacket>();

  data$(): Observable<DataPacket> {
    return this.dataSubject.asObservable();
  }

  command$(): Observable<CommandPacket> {
    return this.commandSubject.asObservable();
  }

  close$(): Observable<void> {
    return this.closeSubject.asObservable();
  }

  abstract receiveData(data: DataPacket): void;

  abstract receiveStatus(status: StatusPacket): void;

  abstract destroy(): void;
}
