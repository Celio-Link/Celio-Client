import {CommandType, LinkStatus} from './service/linkdevice.service.mock';
import {interval, map, Observable, Subscriber} from 'rxjs';
import {DataArray, UInt16} from './service/linkdevice.service.mock';

export class CelioDeviceMock {

  public readonly data$: Observable<DataArray>;
  public readonly status$: Observable<LinkStatus>;

  private index: number = 0;
  private currentCommand: CommandType = CommandType.Empty;
  private status: [CommandType[], LinkStatus][] = [
    [[CommandType.Empty], LinkStatus.HandshakeWaiting],
    [[CommandType.SetModeMaster, CommandType.SetModeSlave], LinkStatus.HandshakeReceived],
    [[CommandType.StartHandshake], LinkStatus.HandshakeFinished],
    [[CommandType.Empty], LinkStatus.LinkConnected],
    [[CommandType.MockCloseLink], LinkStatus.LinkClosed]
  ];
  private connected: boolean = false;

  public commands: CommandType[] = [];

  public onConnectedCallback: () => void = () => {};

  protected history: DataArray[] = [];

  private randomUInt16(): UInt16 {
    return (Math.floor(Math.random() * 0x10000) & 0xffff) as UInt16;
  }

  private randomDataArray(): DataArray {
    return [
      this.randomUInt16(), this.randomUInt16(), this.randomUInt16(), this.randomUInt16(),
      this.randomUInt16(), this.randomUInt16(), this.randomUInt16(), this.randomUInt16(),
    ];
  }

  constructor(protected receiveCallback: (received: DataArray, history: DataArray) => void,
              private intervalMs = 500,
              private intervalUntilClose = 3000) {
    this.data$ = new Observable<DataArray>((subscriber: Subscriber<DataArray>) => {
      const subscription = interval(this.intervalMs).pipe(
        map(() => this.randomDataArray())
      ).subscribe(value => {
        if (!this.connected) return;
        this.history.push(value);
        subscriber.next(value);
      })

      return () => subscription.unsubscribe();
    });

    this.status$ = new Observable<LinkStatus>((subscriber: Subscriber<LinkStatus>) => {
      const subscription = interval(this.intervalMs).subscribe(() => {
        const value = this.getStatus();
        if (!value) return;
        subscriber.next(value);
      })

      return () => subscription.unsubscribe();
    });
  }

  receivedData(receivedData: DataArray) {
    let sendData = this.history.shift()!
    this.receiveCallback(receivedData, sendData);
  }

  setCurrentCommand(command: CommandType) {
    this.commands.push(command);

    if (command === CommandType.ConnectLink) {

      this.connected = true;
      this.onConnectedCallback();

      setTimeout(() => {
        this.connected = false;
        this.currentCommand = CommandType.MockCloseLink
      }, this.intervalUntilClose);
    }

    this.currentCommand = command;
  }

  isConnected() { return this.connected; }

  getStatus() : LinkStatus | undefined {
    if (this.connected) return undefined;
    const commandStatusPair = this.status[this.index];
    if (!commandStatusPair[0].includes(this.currentCommand)) {
      return undefined;
    }
    this.currentCommand = CommandType.Empty;
    this.index++;
    if (this.index > this.status.length) {
      this.index = 0;
    }
    return commandStatusPair[1]
  }
}
