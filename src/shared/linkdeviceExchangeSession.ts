import {Subscription} from 'rxjs';
import {CommandType, DataArray, LinkDeviceService, LinkStatus} from '../services/linkdevice.service';
import {CommandPacket, DataPacket, ISocketBridge, StatusPacket} from './socketBridge.interface';
import {v4 as uuidv4} from 'uuid';


export class LinkdeviceExchangeSession {

  private subscriptions = new Subscription();

  private bufferedPackets: Map<number, DataArray> = new Map();
  protected deviceQueue: DataArray[] = [];

  private commandSet: Set<String> = new Set

  private expectedPacketSequence = 0;
  protected transmittedPacketCounter = 0;

  constructor(protected socketBridge: ISocketBridge, protected linkDeviceService: LinkDeviceService) {
    this.subscriptions.add(linkDeviceService.statusEvents$.subscribe(status => {
      this.handleDeviceStatusToSocket(status);
    }))

    this.subscriptions.add(linkDeviceService.dataEvents$.subscribe(data => {
      this.handleDeviceDataToSocket(data);
    }))

    this.subscriptions.add(this.socketBridge.data$().subscribe((data: DataPacket) => {
      this.handleSocketDataToDevice(new DataPacket(data.sequence, data.data));
    }))

    this.subscriptions.add(this.socketBridge.command$().subscribe((commandPacket: CommandPacket) => {
      this.handleSocketCommandToDevice(commandPacket)
    }))

    this.subscriptions.add(this.socketBridge.close$().subscribe(() => {
      console.log("LinkSession: Unsubscribing from events...");
      this.subscriptions.unsubscribe();
    }))
  }

  handleDeviceDataToSocket(data: DataArray) {
    let packet: DataPacket = new DataPacket(this.transmittedPacketCounter, data);
    this.socketBridge.sendData(packet);
    this.transmittedPacketCounter++;
    console.log("%c Outgoing: " + packet.toString(), 'color: #3366ff');
  }

  handleSocketDataToDevice(packet: DataPacket) {
    console.log("%c Incoming: " + packet.toString(), 'color: #00cc66');
    if (this.expectedPacketSequence > packet.sequence) {
      console.warn("Received data packet has already been received, discarding...");
      return;
    }
    else if (this.expectedPacketSequence < packet.sequence) {
      console.warn("Received data out of order, saved to queue " + JSON.stringify(packet));
      return this.handleOutOfOrderPaket(packet)
    }

    this.deviceQueue.push(packet.data);

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
    this.socketBridge.sendStatus(statusPacket);
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
    this.socketBridge.destroy();
  }
}
