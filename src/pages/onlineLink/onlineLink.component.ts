import {ChangeDetectorRef, Component, HostListener, inject} from '@angular/core';
import { NgClass, NgIf } from '@angular/common';
import { Result } from 'true-myth';

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
  ConnectingCelioDevice = 0,
  JoiningSession = 1,
  WaitingForPartner = 2,
  SettingLinkMode = 3,
  Ready = 4
}

enum ErrorType {
  NotFound = "Not Found",
  AlreadyExists = "AlreadyExists"
}

interface SessionState {
  id: string;
  full: boolean;
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

  private joinMessage: SessionCreationMessage | JoinMessage | undefined = undefined;

  private socket: Socket = io('ws://localhost:8080', {
    transports: ["websocket"],
    autoConnect: true,
    reconnectionAttempts: 4,
    reconnectionDelay: 100,
    reconnectionDelayMax: 1000,
    timeout: 5000,
  });
  protected sessionId: string | undefined = "test";

  protected stepState: StepsState = StepsState.ConnectingCelioDevice;
  protected StepsState = StepsState;

  private queue: DataArray[] = [];

  private dataSubscription: Subscription
  private statusSubscription: Subscription
  private disconnectSubscription: Subscription

  private socketEventHandlers = {

    partnerJoined: () => {
      console.log("Partner joined session");
      this.advanceLinkState(StepsState.SettingLinkMode);
    },

    partnerLeft: () => {
      console.log("Partner left session");
      this.advanceLinkState(StepsState.WaitingForPartner);
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
      console.log("Connected to Server")
    },
  };

  constructor(private cd: ChangeDetectorRef) {
    this.statusSubscription = this.linkDeviceService.statusEvents$.subscribe(statusEvents => {
      this.handleLinkDeviceStatus(statusEvents);
    });

    this.dataSubscription = this.linkDeviceService.dataEvents$.subscribe(data => {
      this.handleLinkDeviceData(data);
    });

    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(disconnect => {
      this.advanceLinkState(StepsState.ConnectingCelioDevice);
      if (this.socket.connected) {
        this.socket.disconnect();
      }
    })
  }

  ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      this.advanceLinkState(StepsState.JoiningSession);
    }

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
    this.linkDeviceService.connectDevice()
      .then(isConnected => {
        if (isConnected) {
          this.advanceLinkState(StepsState.JoiningSession);
        }
      }
    )
  }

  private reviveResult<T, E>(raw: any): Result<T, E> {
    if (raw && raw.variant === "Ok") return Result.ok(raw.value as T);
    if (raw && raw.variant === "Err") return Result.err(raw.error as E);
    throw new Error("Not a valid Result");
  }

  createSession() {
      this.joinMessage = { type: 'sessionCreate' };
      this.socket.emit("sessionCreate",
        this.joinMessage!,
        (raw: any) => this.sessionEnterCallback(this.reviveResult(raw))
      );
  }

  joinSession(sessionId: string) {
    this.joinMessage = { type: 'sessionJoin', id: sessionId };
    this.socket.emit(
      "sessionJoin",
      this.joinMessage!,
      (raw: any) => this.sessionEnterCallback(this.reviveResult(raw))
    );
  }

  leaveSession() {
    this.socket.emit("sessionLeft");
    this.advanceLinkState(StepsState.JoiningSession);
  }

  private sessionEnterCallback(result: Result<SessionState, ErrorType>): void {
    console.log(JSON.stringify(result));
    if (result.isOk) {
      console.log('yes');
      this.sessionId = result.value.id;
      if (result.value.full) {
        this.advanceLinkState(StepsState.SettingLinkMode);
      } else {
        this.advanceLinkState(StepsState.WaitingForPartner);
      }
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
    if (status === LinkStatus.DeviceReady && this.stepState === StepsState.SettingLinkMode) {
      this.advanceLinkState(StepsState.Ready);
    }
    const message: StatusMessage = { type: 'status', statusType: status };
    this.socket.emit('deviceStatus', message);
  }

  enableLinkMode() {
    let args: Uint8Array = new Uint8Array(1);
    args[0] = Mode.onlineLink;
    this.linkDeviceService.sendCommand(CommandType.SetMode, args);
  }

  protected hasReached(step: StepsState): boolean {
    return this.stepState >= step;
  }

  protected yetToReach(step: StepsState): boolean {
    return this.stepState < step;
  }

  protected isCurrentlyIn(step: StepsState): boolean {
    return this.stepState == step
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'ArrowUp') {
      this.stepState++;
    }

    if (event.key === 'ArrowDown') {
      this.stepState--;
    }
  }

  private advanceLinkState(step: StepsState) {
    this.stepState = step;
    this.cd.detectChanges();
  }
}
