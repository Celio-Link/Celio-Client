import { Component, inject } from '@angular/core';
import { NgClass, NgIf } from '@angular/common';
import { Result } from 'true-myth/';

import { CommandType, DataArray, LinkDeviceService, LinkStatus, Mode } from '../../services/linkdevice.service';
import { io, Socket } from "socket.io-client";


import {
  CommandMessage,
  JoinMessage,
  SessionCreationMessage,
  SessionJoinedMessage, SessionPartnerReady,
  StatusMessage
} from '../../client/messenges';
import {Subscription} from 'rxjs';

enum StepsState {
  ConnectedCelioDevice = 0,
  SessionJoined = 1,
  PartnerResponded = 2,
  LinkModeSet = 3,
  Ready = 4
}

enum ErrorType {
  NotFound = "Not Found",
  AlreadyExists = "AlreadyExists"
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

  private socket: Socket = io('wss://server-production-e17f.up.railway.app', {
    transports: ["websocket"],
    autoConnect: false,
    retries: 4,
    reconnectionAttempts: 4,
    reconnectionDelay: 100,
    reconnectionDelayMax: 1000,
    timeout: 5000,
  });
  protected sessionId: string | undefined = undefined;

  protected isInvisible: boolean = true;

  toggle() { this.isInvisible = !this.isInvisible; }

  protected stepState: StepsState = StepsState.ConnectedCelioDevice;

  private queue: DataArray[] = [];

  private dataSubscription: Subscription
  private statusSubscription: Subscription
  private disconnectSubscription: Subscription

  private socketEventHandlers = {

    partnerJoined: () => {
      console.log("Partner is ready");
      this.stepState = StepsState.PartnerResponded
    },

    deviceCommand: (commandType: CommandType) => {
      this.linkDeviceService.sendCommand(commandType);
      console.log('Server has send device command: ' + CommandType[commandType]);
    },

    deviceData: (data: Blob) => {
      data.arrayBuffer().then(buffer => {
        const array = new Uint16Array(buffer, 0, 8);
        const dataArray = Array.from(array) as DataArray;
        this.queue.push(dataArray)
      })
    },

    connect: () => {
      switch(this.joinMessage!.type) {
        case "sessionCreate":
          this.socket.emit("sessionCreate", this.joinMessage!, this.sessionEnterCallback);
          break;
        case 'sessionJoin':
          this.socket.emit("sessionJoin", this.joinMessage!, this.sessionEnterCallback);
          break;
      }
    },

    error: (reason: string) => {

    }

  };

  constructor() {
    this.statusSubscription = this.linkDeviceService.statusEvents$.subscribe(statusEvents => {
      this.handleLinkDeviceStatus(statusEvents);
    });

    this.dataSubscription = this.linkDeviceService.dataEvents$.subscribe(data => {
      this.handleLinkDeviceData(data);
    });

    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(disconnect => {
      this.stepState = StepsState.ConnectedCelioDevice;
      if (this.socket.connected) {
        this.socket.disconnect();
      }
    })
  }

  ngOnInit() {
    this.linkDeviceConnected = this.linkDeviceService.isConnected();

    Object.entries(this.socketEventHandlers).forEach(([event, handler]) => {
      this.socket.on(event, handler);
    });
  }

  ngOnDestroy() {
    this.dataSubscription.unsubscribe();
    this.statusSubscription.unsubscribe();
    this.disconnectSubscription.unsubscribe();

    Object.entries(this.socketEventHandlers).forEach(([event, handler]) => {
      this.socket.off(event, handler);
    });
  }

  connect(): void {
    this.stepState = StepsState.SessionJoined

    this.linkDeviceService.connectDevice()
      .then(isConnected => {
        this.linkDeviceConnected = isConnected
        if (isConnected) {
          this.stepState = StepsState.SessionJoined
        }
      }
    )
  }

  createSession() {
      this.joinMessage = { type: 'sessionCreate' };
      this.socket.connect();
  }

  joinSession() {
    this.joinMessage = { type: 'sessionJoin', id: 'test' };
    this.socket.connect();
  }

  private sessionEnterCallback(result: Result<string, ErrorType>): void {
    if (result.isOk) {
      this.stepState = StepsState.SessionJoined;
    } else {
      switch(result.error) {
        case ErrorType.AlreadyExists:
        case ErrorType.NotFound:
      }
    }
  }

  handleLinkDeviceData(data: DataArray) {
    if (this.queue.length > 0) {
      let data = this.queue.shift();
      this.linkDeviceService.sendData(data!)
      console.log("Transmit data to Link device " + data!.toString())
    }
    if (data[0] == 0x00) return;
    if ((data[0] == 0xCAFE) && (data[1] == 0x11)) return;
    this.socket.emit('deviceData', data);
    console.log("Received data from Link device " + data.toString())
  }

  handleLinkDeviceStatus(status: LinkStatus) {
    if (status === LinkStatus.HandshakeWaiting) {
      this.stepState = StepsState.Ready
    }
    const message: StatusMessage = { type: 'status', statusType: status };
    this.socket.emit('deviceStatus', JSON.stringify({ message }));
  }

  enableLinkMode() {
    this.stepState = StepsState.LinkModeSet
    let args: Uint8Array = new Uint8Array(1);
    args[0] = Mode.onlineLink;
    this.linkDeviceService.sendCommand(CommandType.SetMode, args);
  }
}
