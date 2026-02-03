import {ChangeDetectorRef, Component, HostListener, inject} from '@angular/core';
import { NgClass, NgIf } from '@angular/common';

import {CommandType, LinkDeviceService, LinkStatus, Mode} from '../../services/linkdevice.service';

import {Subscription} from 'rxjs';
import {PlayerSessionService} from '../../services/playersession.service';
import {WebSocketService} from '../../services/websocket.service';
import {LinkdeviceExchangeSession} from './linkdeviceExchangeSession';

enum StepsState {
  ConnectingCelioDevice = 0,
  JoiningSession = 1,
  WaitingForPartner = 2,
  SettingLinkMode = 3,
  Ready = 4
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

  protected sessionId: string | undefined = "";

  protected stepState: StepsState = StepsState.ConnectingCelioDevice;
  protected StepsState = StepsState;

  private partnerSubscription: Subscription
  private linkSessionCloseSubscription: Subscription

  private linkSession: LinkdeviceExchangeSession | undefined = undefined;

  constructor(private cd: ChangeDetectorRef, private playerSessionService: PlayerSessionService, private socket: WebSocketService) {
    this.partnerSubscription = this.playerSessionService.partnerEvents$.subscribe(partnerConnected => {
      if (partnerConnected) {
        this.advanceLinkState(StepsState.SettingLinkMode);
        this.linkSession = new LinkdeviceExchangeSession(this.socket, this.linkDeviceService);
      }
      else {
        this.advanceLinkState(StepsState.WaitingForPartner);
      }
    });

    this.linkSessionCloseSubscription = this.playerSessionService.sessionRenew$.subscribe(() => {
      this.linkSession = new LinkdeviceExchangeSession(this.socket, this.linkDeviceService);
    });
  }

  ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      this.advanceLinkState(StepsState.JoiningSession);
      this.socket.connect();
    }
  }

  ngOnDestroy() {
    this.partnerSubscription.unsubscribe();
    this.linkSessionCloseSubscription.unsubscribe();
  }

  connect(): void {
    this.linkDeviceService.connectDevice()
      .then(isConnected => {
        if (isConnected) {
          this.advanceLinkState(StepsState.JoiningSession);
          this.socket.connect();
        }
      }
    )
  }

  async enableLinkMode():Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error('Timed out waiting for device to get ready'));
      }, 2000);

      const subscription = this.linkDeviceService.statusEvents$.subscribe(statusEvent => {
        console.log(statusEvent);
        if (statusEvent === LinkStatus.DeviceReady) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve(true);
        }
      });

      this.linkDeviceService.sendCommand(CommandType.Cancel).then(ok => {
        if (!ok) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          reject(new Error('Failed to send Cancel command'));
        }
      });

      let args: Uint8Array = new Uint8Array(1);
      args[0] = Mode.onlineLink;
      this.linkDeviceService.sendCommand(CommandType.SetMode, args).then(ok => {
        if (!ok) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          reject(new Error('Failed to send SetMode command'));
        }
      })
    });
  }

  async start() {
    let success = await this.enableLinkMode();
    if (!success)
    {
      console.log("Failed to enable link mode");
    }
    this.stepState = StepsState.Ready;
  }

  disconnect(): void {
    this.linkDeviceService.sendCommand(CommandType.Cancel);
    this.stepState = StepsState.JoiningSession;
    this.playerSessionService.leaveSession();
    this.cd.detectChanges();
  }

  createSession() {
    this.playerSessionService.createSession().then(session => {
      this.sessionId = session.id;
      this.advanceLinkState(StepsState.WaitingForPartner);
    });
  }

  joinSession(sessionId: string) {
    this.playerSessionService.joinSession(sessionId).then(session => {
      this.linkSession = new LinkdeviceExchangeSession(this.socket, this.linkDeviceService);
      this.advanceLinkState(StepsState.SettingLinkMode);
    });
  }

  renewSession() {
    this.linkSession = new LinkdeviceExchangeSession(this.socket, this.linkDeviceService);
  }

  leaveSession() {
    this.playerSessionService.leaveSession();
    this.advanceLinkState(StepsState.JoiningSession);
    this.linkSession = undefined;
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
