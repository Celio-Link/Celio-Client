import {Subscription} from 'rxjs';
import {WebSocketService} from '../../services/websocket.service';
import {CommandType, DataArray, LinkDeviceService, LinkStatus} from '../../services/linkdevice.service';
import {v4 as uuidv4} from 'uuid';

export class DataPacket {
  public sequence: number;
  public data: DataArray;

  constructor(sequence: number, data: DataArray) {
    this.sequence = sequence;
    this.data = data;
  }

  private dataToString(): string {
    let out = "";
    for (let i = 0; i < this.data.length; i++) {
      if (i) out += " ";
      out += "0x" + (this.data[i] & 0xffff).toString(16).padStart(4, "0").toUpperCase();
    }
    return out;
  }

  toString(): string {
    return this.dataToString() + ", sequence = " + this.sequence;
  }
}

interface CommandPacket {
  uuid: string;
  command: CommandType;
}

export interface StatusPacket {
  uuid: string;
  linkStatus: LinkStatus;
}

export class LinkdeviceExchangeSession {

  private subscriptions = new Subscription();

  private bufferedPackets: Map<number, DataArray> = new Map();
  protected deviceQueue: DataArray[] = [];

  private commandSet: Set<String> = new Set

  private expectedPacketSequence = 0;
  protected transmittedPacketCounter = 0;

  constructor(protected websocketService: WebSocketService, protected linkDeviceService: LinkDeviceService) {
    this.subscriptions.add(linkDeviceService.statusEvents$.subscribe(status => {
      this.handleDeviceStatusToSocket(status);
    }))

    this.subscriptions.add(linkDeviceService.dataEvents$.subscribe(data => {
      this.handleDeviceDataToSocket(data);
    }))

    this.subscriptions.add(this.websocketService.fromEventWithAck<DataPacket>('deviceData').subscribe(({data, ack}) => {
      this.handleSocketDataToDevice(new DataPacket(data.sequence, data.data));
      ack(true); //FIXME better ack handling
    }))

    this.subscriptions.add(this.websocketService.fromEvent<CommandPacket>('deviceCommand').subscribe((commandPacket: CommandPacket) => {
      this.handleSocketCommandToDevice(commandPacket)
    }))

    this.subscriptions.add(this.websocketService.fromEvent<void>('sessionClose').subscribe(() => {
      console.log("LinkSession: Unsubscribing from events...");
      this.subscriptions.unsubscribe();
    }))
  }

  handleDeviceDataToSocket(data: DataArray) {
    const queued = this.deviceQueue.shift();
    if (this.deviceQueue.length > 10){
      console.warn("Queue status: " + JSON.stringify(this.deviceQueue));
    }
    if (queued) {
      this.linkDeviceService.sendData(queued).then(
        null,
        () => {
          console.log("Transmit data to device: ERROR, Unshift data to queue...");
          this.deviceQueue.unshift(queued);
        }
      );
    }

    if (data[0] == 0x00) return;
    if ((data[0] == 0xCAFE) && (data[1] == 0x11)) return;

    let packet: DataPacket = new DataPacket(this.transmittedPacketCounter, data);
    this.websocketService.emit('deviceData', packet);
    this.transmittedPacketCounter++;
    console.log("Outgoing: " + packet.toString());
  }

  handleSocketDataToDevice(packet: DataPacket) {
    console.log("Incoming: " + packet.toString());
    if (this.expectedPacketSequence > packet.sequence) {
      console.warn("Received data packet has already been received, discarding...");
      return;
    }
    else if (this.expectedPacketSequence < packet.sequence) {
      console.warn("Received data out of order, saved to queue " + JSON.stringify(packet));
      return this.handleOutOfOrderPaket(packet)
    }

    this.deviceQueue.push(packet.data);
    this.expectedPacketSequence++;
  }

  handleOutOfOrderPaket(packet: DataPacket) {
    this.bufferedPackets.set(packet.sequence, packet.data);
    console.warn(this.expectedPacketSequence);
    let nextPacket = this.bufferedPackets.get(this.expectedPacketSequence);
    while (nextPacket) {
      console.warn("Putting buffered packet into device queue: " + JSON.stringify(nextPacket));
      this.deviceQueue.push(nextPacket);
      this.bufferedPackets.delete(this.expectedPacketSequence);
      this.expectedPacketSequence++;
      nextPacket = this.bufferedPackets.get(this.expectedPacketSequence);
    }
  }

  handleDeviceStatusToSocket(status: LinkStatus) {
    console.log("Celio device has emitted a LinkStatus event: " + LinkStatus[status]);
    switch(status) {
      case LinkStatus.DeviceReady:
      case LinkStatus.EmuTradeSessionFinished:
      case LinkStatus.StatusDebug:
        return;
      default:
    }

    const statusPacket: StatusPacket = { uuid: uuidv4(), linkStatus: status };
    this.websocketService.emit('deviceStatus', statusPacket);
  }

  handleSocketCommandToDevice(commandPacket: CommandPacket) {

    if (this.commandSet.has(commandPacket.uuid)) return;
    this.commandSet.add(commandPacket.uuid);

    this.linkDeviceService.sendCommand(commandPacket.command).then(
      () => console.log("Command '"  + CommandType[commandPacket.command] + "' has been send to Celio device"),
      () => console.log("Command send to Celio device failed with: ERROR")
    )
  }

  destroy() {
    this.subscriptions.unsubscribe();
  }
}
