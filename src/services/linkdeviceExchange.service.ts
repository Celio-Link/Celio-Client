import {Injectable} from '@angular/core';
import {Subscription} from 'rxjs';
import {WebSocketService} from './websocket.service';
import {CommandType, DataArray, LinkDeviceService, LinkStatus} from './linkdevice.service';
import { v4 as uuidv4 } from 'uuid';

interface DataPacket {
  sequence: number;
  data: DataArray;
}

interface CommandPacket {
  uuid: string;
  command: CommandType;
}

interface StatusPacket {
  uuid: string;
  status: LinkStatus;
}

@Injectable({  providedIn: 'root',})
export class LinkDeviceExchangeService {

  private subscriptions = new Subscription();

  private bufferedPackets: Map<number, DataArray> = new Map();
  private deviceQueue: DataArray[] = [];

  private commandSet: Set<String> = new Set

  private expectedPacketSequence = 0;
  private transmittedPacketCounter = 0;

  constructor(private websocketService: WebSocketService, private linkDeviceService: LinkDeviceService) {
    this.subscriptions.add(linkDeviceService.statusEvents$.subscribe(status => {
      this.handleDeviceCommandToSocket(status);
    }))
    this.subscriptions.add(linkDeviceService.dataEvents$.subscribe(data => {
      this.handleDeviceDataToSocket(data);
    }))

    this.subscriptions.add(this.websocketService.fromEvent<DataPacket>('deviceData').subscribe((packet: DataPacket) => {
      this.handleSocketDataToDevice(packet)
    }))
    this.subscriptions.add(this.websocketService.fromEvent<CommandPacket>('deviceCommand').subscribe((commandPacket: CommandPacket) => {
      this.handleSocketCommandToDevice(commandPacket)
    }))
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  handleDeviceDataToSocket(data: DataArray) {
    const queued = this.deviceQueue.shift();
    if (queued) {
      this.linkDeviceService.sendData(queued).then(
        () => console.log("Transmit data to device: ", queued),
        () => {
          console.log("Transmit data to device: ERROR, Unshift data to queue...");
          this.deviceQueue.unshift(queued);
        }
      );
    }

    if (data[0] == 0x00) return;
    if ((data[0] == 0xCAFE) && (data[1] == 0x11)) return;

    let packet: DataPacket = {sequence: this.transmittedPacketCounter, data: data};
    this.websocketService.emit('deviceData', packet);
    this.transmittedPacketCounter++;
    console.log("Send data to socket " + data.toString())
  }

  handleSocketDataToDevice(packet: DataPacket) {
    if (this.expectedPacketSequence > packet.sequence) {
      console.log("Received data packet has already been received, discarding...");
      return;
    }
    else if (this.expectedPacketSequence < packet.sequence) {
      console.log("Received data out of order, saved to queue");
      return this.handleOutOfOrderPaket(packet)
    }

    this.deviceQueue.push(packet.data);
    this.expectedPacketSequence++;
  }

  handleOutOfOrderPaket(packet: DataPacket) {
    this.bufferedPackets.set(packet.sequence, packet.data);
    let nextPacket = this.bufferedPackets.get(this.expectedPacketSequence);
    while (nextPacket) {
      this.deviceQueue.push(nextPacket);
      this.bufferedPackets.delete(this.expectedPacketSequence);
      this.expectedPacketSequence++;
      nextPacket = this.bufferedPackets.get(this.expectedPacketSequence);
    }
  }

  handleDeviceCommandToSocket(status: LinkStatus) {
    console.log("Device send LinkStatus: " + LinkStatus[status]);
    switch(status) {
      case LinkStatus.DeviceReady:
      case LinkStatus.EmuTradeSessionFinished:
      case LinkStatus.StatusDebug:
        return;
      default:
    }

    const statusPacket: StatusPacket = { uuid: uuidv4(), status: status };
    this.websocketService.emit('deviceStatus', statusPacket);
  }

  handleSocketCommandToDevice(commandPacket: CommandPacket) {

    if (this.commandSet.has(commandPacket.uuid)) return;
    this.commandSet.add(commandPacket.uuid);

    this.linkDeviceService.sendCommand(commandPacket.command).then(
      () => console.log("Send command to device: " + CommandType[commandPacket.command]),
      () => console.log("Send command to device: ERROR")
    )
  }

  resetPacketCounter() {
    this.expectedPacketSequence = 0;
    this.transmittedPacketCounter = 0;
    this.bufferedPackets.clear();
    this.commandSet.clear();
    this.deviceQueue = [];
  }

}
