import {ChangeDetectorRef, Component, HostListener, inject, ViewChild} from '@angular/core';
import { NgClass, NgIf } from '@angular/common';

import {CommandType, LinkDeviceService, LinkStatus, Mode} from '../../services/linkdevice.service';

import {Subscription} from 'rxjs';
import {PlayerSessionService} from '../../services/playersession.service';
import {WebSocketService} from '../../services/websocket.service';
import {LinkdeviceExchangeSession} from './linkdeviceExchangeSession';
import {ToastComponent} from '../../Component/toast.component';
import {environment} from '../../environments/environment';

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
    NgClass,
    ToastComponent
  ],
  templateUrl: './onlineLink.component.html'
})

export class OnlineLinkComponent {

  @ViewChild(ToastComponent) toast!: ToastComponent;

  private linkDeviceService = inject(LinkDeviceService)

  protected sessionId: string | undefined = "";

  protected stepState: StepsState = StepsState.ConnectingCelioDevice;
  protected StepsState = StepsState;

  private partnerSubscription: Subscription
  private linkSessionCloseSubscription: Subscription
  private disconnectSubscription: Subscription;

  private linkSession: LinkdeviceExchangeSession | undefined = undefined;
  protected webUsbError: boolean = false;

  constructor(private cd: ChangeDetectorRef, private playerSessionService: PlayerSessionService, private socket: WebSocketService) {
    this.partnerSubscription = this.playerSessionService.partnerEvents$.subscribe(partnerConnected => {
      if (partnerConnected) {
        this.advanceLinkState(StepsState.SettingLinkMode);
        this.renewLinkSession();
      }
      else {
        this.toast.show("Partner has disconnected");
        this.disconnect();
      }
    });

    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(disconnect => {
      this.stepState = StepsState.ConnectingCelioDevice;
      this.playerSessionService.leaveSession();
      this.linkSession?.destroy();
      this.cd.detectChanges();
    })

    this.linkSessionCloseSubscription = this.playerSessionService.sessionRenew$.subscribe(() => {
      this.disconnect();
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
    this.disconnectSubscription.unsubscribe();
    this.linkSession?.destroy();
  }

  connect(): void {
    if (navigator.usb == undefined) {
      this.webUsbError = true;
      return;
    }

    this.linkDeviceService.connectDevice()
      .then(isConnected => {
        if (isConnected) {
          this.advanceLinkState(StepsState.JoiningSession);
          this.socket.connect();
        }
      }
    )
  }

  private sendCancel():Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.linkDeviceService.sendCommand(CommandType.Cancel).then(ok => {
        if (!ok) {
          reject(new Error('Failed to send Cancel command'));
        }
        resolve();
      });
    });
  }

  private enableLinkMode():Promise<void> {
    let args: Uint8Array = new Uint8Array(1);
    args[0] = Mode.onlineLink;
    return new Promise<void>((resolve, reject) => {
      this.linkDeviceService.sendCommand(CommandType.SetMode, args).then(ok => {
        if (!ok) {
          reject(new Error('Failed to send SetMode command'));
        }
        resolve();
      })
    })
  }

   private createReadyPromise(timeoutMs = 2500): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const subscription = this.linkDeviceService.statusEvents$.subscribe(status => {
        if (status === LinkStatus.DeviceReady) {
          cleanup();
          resolve();
        }
      });

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for device to get ready'));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        subscription.unsubscribe();
      };
    });
  }

  async start() {

    const waitForReady = this.createReadyPromise();

    this.sendCancel()
      .then(() => this.enableLinkMode())
      .then(() => waitForReady)
      .then(() => this.stepState = StepsState.Ready)
      .catch(error => {
        this.toast.show(error.message, 'error', 4000)
        console.error(error);
        this.disconnect();
      });

  }

  disconnect(): void {
    this.linkDeviceService.sendCommand(CommandType.Cancel);
    this.stepState = StepsState.JoiningSession;
    this.playerSessionService.leaveSession();
    this.renewLinkSession();
    this.cd.detectChanges();
  }

  createSession() {
    this.playerSessionService.createSession().then(session => {
      this.sessionId = session.id;
      this.renewLinkSession();
      this.advanceLinkState(StepsState.WaitingForPartner);
    });
  }

  joinSession(sessionId: string) {
    this.playerSessionService.joinSession(sessionId).then(session => {
      this.renewLinkSession();
      this.advanceLinkState(StepsState.SettingLinkMode);
      this.sessionId = session.id;
    }).catch(error => {
      this.toast.show(error, 'error', 4000)
      console.error(error);
    })
  }

  leaveSession() {
    this.playerSessionService.leaveSession();
    this.advanceLinkState(StepsState.JoiningSession);
    this.renewLinkSession();
  }

  renewLinkSession() {
    this.linkSession?.destroy();
    this.linkSession = new LinkdeviceExchangeSession(this.socket, this.linkDeviceService);
  }

  protected hasReached(step: StepsState): boolean {
    return this.stepState >= step;
  }

  protected yetToReach(step: StepsState): boolean {
    return this.stepState < step;
  }

  protected isCurrentlyIn(step: StepsState): boolean {
    if (this.webUsbError) return false;
    return this.stepState == step
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKeyboardEvent(event: KeyboardEvent) {

    if (environment.production) return;

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
