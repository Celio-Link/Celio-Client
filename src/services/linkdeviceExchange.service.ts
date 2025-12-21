import {Injectable} from '@angular/core';
import {Subscription} from 'rxjs';
import {WebSocketService} from './websocket.service';
import {CommandType, DataArray, LinkDeviceService, LinkStatus} from './linkdevice.service';
import { v4 as uuidv4 } from 'uuid';

export interface DataPacket {
  sequence: number;
  data: DataArray;
}

interface CommandPacket {
  uuid: string;
  command: CommandType;
}

export interface StatusPacket {
  uuid: string;
  linkStatus: LinkStatus;
}

@Injectable({  providedIn: 'root',})
export class LinkDeviceExchangeService {

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
      this.handleSocketDataToDevice(data);
      ack(true); //FIXME better ack handling
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
    console.log("Device queue status: " + JSON.stringify(this.deviceQueue));
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
    console.log("Send data to socket " + JSON.stringify(packet))
  }

  handleSocketDataToDevice(packet: DataPacket) {
    console.log("Received data packet from socket: " + JSON.stringify(packet));
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

  resetPacketCounter() {
    this.expectedPacketSequence = 0;
    this.transmittedPacketCounter = 0;
    this.bufferedPackets.clear();
    this.commandSet.clear();
    this.deviceQueue = [];
  }

}
