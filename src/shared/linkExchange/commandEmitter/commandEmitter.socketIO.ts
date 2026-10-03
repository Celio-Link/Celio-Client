import {CommandPacket, DataPacket, StatusPacket} from '../common'
import {CommandEmitterAbstract} from './commandEmitter.abstract'
import {concatMap, Subject, Subscription} from 'rxjs';
import {WebSocketService} from '../../../services/websocket.service';

interface OutgoingAckablePacket {
  event: string;
  data: DataPacket | StatusPacket;
}

export class CommandEmitterSocketIO extends CommandEmitterAbstract {

  private subscriptions = new Subscription();

  // Data and status packets share one queue to keep the order in which the device emitted them
  private send$ = new Subject<OutgoingAckablePacket>();

  constructor(protected websocketService: WebSocketService) {

    super();
    this.subscriptions.add(
      this.send$.pipe(
        concatMap((packet: OutgoingAckablePacket) =>
          this.websocketService.emitWithRetry(packet.event, packet.data)
            .then(
              (acked) => {
                if (acked !== true) console.warn("Server rejected " + packet.event + ": " + JSON.stringify(packet.data));
              },
              (err) => console.error("Ack for " + packet.event + " failed after retries:", err)
            )
        )
      ).subscribe()
    );

    this.subscriptions.add(
      this.websocketService
        .fromEventWithAck<DataPacket>('deviceData')
        .subscribe(({data, ack}) => {
          ack(true); //FIXME better ack handling
          this.dataSubject.next(data);
        })
    );

    this.subscriptions.add(
      this.websocketService
        .fromEvent<CommandPacket>('deviceCommand')
        .subscribe((commandPacket: CommandPacket) => {
          this.commandSubject.next(commandPacket);
        })
    );

    this.subscriptions.add(
      this.websocketService
        .fromEvent<void>('sessionClose')
        .subscribe(() => {
          console.log("LinkSession: Unsubscribing from events...");
          this.closeSubject.next();
          this.destroy();
        })
    );

  }

  receiveData(data: DataPacket) : void {
    this.send$.next({event: 'deviceData', data: data});
  }

  receiveStatus(status: StatusPacket) : void {
    this.send$.next({event: 'deviceStatus', data: status});
  }

  destroy() {
    this.subscriptions.unsubscribe();
  }

}
