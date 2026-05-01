import {Observable} from 'rxjs';
import {CommandPacket, DataPacket, StatusPacket} from '../common';

export interface CommandEmitterInterface {

  data$(): Observable<DataPacket>;

  command$(): Observable<CommandPacket>;

  close$(): Observable<void>;

  sendData(data: DataPacket): void;

  sendStatus(status: StatusPacket): void;

  destroy(): void;
}
