import {Component, inject} from '@angular/core';
import {NgClass, NgIf} from '@angular/common';

import {CommandType, DataArray, LinkDeviceService, LinkStatus, Mode} from '../../services/linkdevice.service';
import {Client, ClientStatus} from '../../client/client'
import {
  CommandMessage,
  JoinMessage,
  SessionCreationMessage,
  SessionJoinedMessage, SessionPartnerReady,
  StatusMessage
} from '../../client/messenges';
import {Subscription} from 'rxjs';

enum StepsState {
  Start = 0,
  ConnectedCelioDevice = 1,
  SessionJoined = 2,
  PartnerResponded = 3,
  LinkModeSet = 4,
  Ready = 5
}

@Component({
  selector: 'app-onlineLink',
  standalone: true,
  imports: [
    NgIf,
    NgClass
  ],
  templateUrl: './onlineLink.component.html'
})
export class OnlineLinkComponent {
  private linkDeviceService = inject(LinkDeviceService)
  protected linkDeviceConnected = false;

  private joinMessage: SessionCreationMessage | JoinMessage | undefined = undefined;
  private client = new Client('wss://server-production-e17f.up.railway.app')
  protected sessionId: string | undefined = undefined;

  protected stepState: StepsState = StepsState.Start

  private queue: DataArray[] = [];

  private dataSubscription: Subscription
  private statusSubscription: Subscription

  constructor() {
    this.statusSubscription = this.linkDeviceService.statusEvents$.subscribe(statusEvents => {
      this.handleLinkDeviceStatus(statusEvents);
    });

    this.dataSubscription = this.linkDeviceService.dataEvents$.subscribe(data => {
      this.handleLinkDeviceData(data);
    });
  }

  ngOnInit() {
    this.linkDeviceConnected = this.linkDeviceService.isConnected()

    this.client.bind('sessionJoined', (message: SessionJoinedMessage) => {
      console.log("Session created with id: " + message.sessionId);
      this.sessionId = message.sessionId;
      this.stepState = StepsState.SessionJoined
    });

    this.client.bind('partnerReady', (message: SessionPartnerReady) => {
      console.log("Partner is ready");
      this.stepState = StepsState.PartnerResponded
    });

    this.client.bind('command', (message: CommandMessage) => {
      this.linkDeviceService.sendCommand(message.commandType);
      console.log('Server has send command: ' + CommandType[message.commandType]);
    });

    this.client.bind('data', (data: Blob) => {
      data.arrayBuffer().then(buffer => {
        const array = new Uint16Array(buffer, 0, 8);
        const dataArray = Array.from(array) as DataArray;
        this.queue.push(dataArray)
      })
    });
  }

  ngOnDestroy() {
    this.dataSubscription.unsubscribe();
    this.statusSubscription.unsubscribe();
  }

  connect(): void {
      this.linkDeviceService.connectDevice()
        .then(isConnected => {
          this.linkDeviceConnected = isConnected
          if (isConnected) {
            this.stepState = StepsState.ConnectedCelioDevice
          }
        }
      )
  }

  clientState(status: ClientStatus): void {
      switch (status) {
        case ClientStatus.Open:
          this.client?.send(JSON.stringify(this.joinMessage));
      }
  }

  createSession() {
      this.joinMessage = { type: 'sessionCreate' };
      this.client.connect(this.clientState.bind(this));
  }

  joinSession() {
    this.joinMessage = { type: 'sessionJoin', id: 'test' };
    this.client.connect(this.clientState.bind(this));
  }

  handleLinkDeviceData(data: DataArray) {
    if (this.queue.length > 0) {
      let data = this.queue.shift();
      this.linkDeviceService.sendData(data!)
      console.log("Transmit data to Link device " + data!.toString())
    }
    if (data[0] == 0x00) return;
    if ((data[0] == 0xCAFE) && (data[1] == 0x11)) return;
    this.client.sendBinary(data);
    console.log("Received data from Link device " + data.toString())
  }

  handleLinkDeviceStatus(status: LinkStatus) {
    if (status === LinkStatus.HandshakeWaiting) {
      this.stepState = StepsState.Ready
    }
    const message: StatusMessage = { type: 'status', statusType: status };
    this.client.send(JSON.stringify({ message }));
  }

  enableLinkMode() {
    this.stepState = StepsState.LinkModeSet
    let args: Uint8Array = new Uint8Array(1);
    args[0] = Mode.onlineLink;
    this.linkDeviceService.sendCommand(CommandType.SetMode, args);
  }
}
