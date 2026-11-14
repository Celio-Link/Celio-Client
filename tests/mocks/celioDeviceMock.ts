import {CommandType, DataArray, LinkStatus, UInt8} from './service/linkdevice.service.mock';
import {DATA_ARRAY_LENGTH} from '../../src/shared/linkExchange/common';
import {finalize, from, interval, map, Observable, Subject, Subscriber, switchMap, zipWith} from 'rxjs';
import {v4 as uuidv4} from 'uuid';

export class CelioDeviceMock {

  public readonly data$: Observable<DataArray>;
  public readonly status$: Observable<LinkStatus>;

  private handshakeComplete$ = new Subject<void>();

  // The device that reports LinkConnected first is linked on its own, the others are linked by ConnectLink
  private linkConnected = false;

  private currentStatus: LinkStatus | undefined = LinkStatus.AwaitMode;
  public commands: CommandType[] = [];

  // Set by the PlayerSettings command
  public playerCount: number | undefined;
  public playerIndex: number | undefined;

  public onConnectedCallback: () => void = () => {};
  public onLinkCloseCallback: () => void = () => {};

  private id = uuidv4();

  private index = 0;

  private randomUInt8(): UInt8 {
    return Math.floor(Math.random() * 0x100) as UInt8;
  }

  private randomDataArray(secondSlot: UInt8): DataArray {
    const data = Array.from({length: DATA_ARRAY_LENGTH}, () => this.randomUInt8());
    data[1] = secondSlot;
    return data as DataArray;
  }

  // Data this device sends, ending with the all-zero sentinel
  public readonly data: DataArray[] = []

  constructor(protected receiveCallback: (received: DataArray, history: DataArray) => void,
              numberOfEmits: number, private intervalMs = 500) {

    for (let i = 0; i < numberOfEmits; i++) {
      this.data.push(this.randomDataArray(i as UInt8));
    }

    //sentinel
    this.data.push(new Array(DATA_ARRAY_LENGTH).fill(0) as DataArray)

    this.data$ = this.handshakeComplete$.pipe(
      switchMap(() =>
        from(this.data).pipe(
          zipWith(interval(this.intervalMs)),
          map(([dataItem]) => dataItem),
          finalize(() => {
            this.setCurrentCommand(CommandType.MockCloseLink);
          })
        )
      )
    );

    this.status$ = new Observable<LinkStatus>((subscriber: Subscriber<LinkStatus>) => {
      const subscription = interval(this.intervalMs).subscribe(() => {
        console.log("Celio device '" + this.id+ "' has emitted a LinkStatus event: " + LinkStatus[this.currentStatus!]);
        if (!this.currentStatus) return
        const status = this.currentStatus;
        subscriber.next(status);
        this.currentStatus = undefined;
        if (status === LinkStatus.LinkConnected) this.connectLink();
      })

      return () => subscription.unsubscribe();
    });
  }

  receivedData(receivedData: DataArray) {
    // The all-zero sentinel only marks the end of the partner's data stream
    if (receivedData.every(value => value === 0)) return;
    if (this.index == this.data.length - 1) {
      this.index = 0;
    }
    let sendData = this.data[this.index]!;
    this.index++;
    this.receiveCallback(receivedData, sendData);
  }

  restart() {
    this.linkConnected = false;
    this.currentStatus = LinkStatus.AwaitMode;
  }

  private connectLink() {
    if (this.linkConnected) return;
    this.linkConnected = true;
    this.handshakeComplete$.next();
    this.onConnectedCallback();
  }

  setCurrentCommand(command: CommandType, payload: Uint8Array = new Uint8Array(0)) {

    this.commands.push(command);

    switch (command) {
      case CommandType.PlayerSettings:
        this.playerCount = payload[0];
        this.playerIndex = payload[1];
        this.currentStatus = LinkStatus.HandshakeReceived;
        break;

      case CommandType.StartHandshake:
        this.currentStatus = LinkStatus.HandshakeFinished;
        setTimeout(() => {
          this.currentStatus = LinkStatus.LinkConnected;
        }, this.intervalMs);
        break;

      case CommandType.ConnectLink:
        this.connectLink();
        break;

      case CommandType.MockCloseLink:
        this.onLinkCloseCallback();
        this.currentStatus = LinkStatus.LinkClosed;
    }

  }
}
