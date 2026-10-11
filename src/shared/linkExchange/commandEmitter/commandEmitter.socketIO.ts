import {CommandPacket, DataPacket, StatusPacket} from '../common'
import {CommandEmitterAbstract} from './commandEmitter.abstract'
import {concatMap, Subject, Subscription} from 'rxjs';
import {WebSocketService} from '../../../services/websocket.service';

const MAX_UNACKED_DATA: number = 64;

export class CommandEmitterSocketIO extends CommandEmitterAbstract {

  private subscriptions = new Subscription();

  private status$ = new Subject<StatusPacket>();

  private dataQueue: DataPacket[] = [];
  private dataInFlight: number = 0;
  private destroyed: boolean = false;

  constructor(protected websocketService: WebSocketService) {

    super();
    this.subscriptions.add(
      this.status$.pipe(
        concatMap((status: StatusPacket) => this.emitWithRetry('deviceStatus', status))
      ).subscribe()
    );

    this.subscriptions.add(
      this.websocketService
        .fromEventWithAck<DataPacket[]>('deviceData')
        .subscribe(({data, ack}) => {
          ack(true);
          data.forEach(packet => this.dataSubject.next(packet));
        })
    );

    this.subscriptions.add(
      this.websocketService
        .fromEventWithAck<CommandPacket>('deviceCommand')
        .subscribe(({data, ack}) => {
          // Duplicates from retries are filtered by uuid in the LinkExchangeSession
          ack(true);
          this.commandSubject.next(data);
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
    if (this.destroyed) return;
    this.dataQueue.push(data);
    this.sendQueuedData();
  }

  receiveStatus(status: StatusPacket) : void {
    this.status$.next(status);
  }

  private sendQueuedData() {
    while (!this.destroyed && this.dataInFlight < MAX_UNACKED_DATA && this.dataQueue.length > 0) {
      const packet = this.dataQueue.shift()!;
      this.dataInFlight++;
      this.emitWithRetry('deviceData', [packet]).finally(() => {
        this.dataInFlight--;
        this.sendQueuedData();
      });
    }
  }

  private emitWithRetry(event: string, data: DataPacket[] | StatusPacket): Promise<void> {
    return this.websocketService.emitWithRetry(event, data)
      .then(
        (acked) => {
          if (acked !== true) console.warn("Server rejected " + event + ": " + JSON.stringify(data));
        },
        (err) => console.error("Ack for " + event + " failed after retries:", err)
      );
  }

  destroy() {
    this.destroyed = true;
    this.dataQueue = [];
    this.subscriptions.unsubscribe();
  }

}
