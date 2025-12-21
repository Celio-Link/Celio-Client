import {CommandType, LinkStatus} from './service/linkdevice.service.mock';

export class ConnectionStatusMock {

  private index: number = 0;
  private currentCommand: CommandType = CommandType.Empty;
  private status: [CommandType[], LinkStatus][] = [
    [[CommandType.Empty], LinkStatus.HandshakeWaiting],
    [[CommandType.SetModeMaster, CommandType.SetModeSlave], LinkStatus.HandshakeReceived],
    [[CommandType.StartHandshake], LinkStatus.HandshakeFinished],
    [[CommandType.Empty], LinkStatus.LinkConnected]
  ];
  private connected: boolean = false;

  public commands: CommandType[] = [];

  public onConnectedCallback: () => void = () => {};

  setCurrentCommand(command: CommandType) {
    this.commands.push(command);
    if (command === CommandType.ConnectLink) {
      this.connected = true;
      this.onConnectedCallback();
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
