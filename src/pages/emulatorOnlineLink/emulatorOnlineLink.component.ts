import {Component, ChangeDetectorRef, ViewChild} from '@angular/core';
import {NgClass, NgIf} from '@angular/common';
import {Subscription, take} from 'rxjs';
import {LinkExchangeSession} from '../../shared/linkExchange/linkExchangeSession';
import {EmulatorSelectionService, SupportedEmulators} from '../../services/emulatorSelection.service';
import {LinkDeviceUtils} from '../../shared/linkDeviceUtils';
import {ToastComponent} from '../../component/toast.component';
import {PlayerSessionService} from '../../services/playersession.service';
import {WebSocketService} from '../../services/websocket.service';
import {StatusEmitterWebsocket} from '../../shared/linkExchange/statusEmitter/statusEmitter.websocket';
import {CommandEmitterSocketIO} from '../../shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {CelioPageAbstract} from '../shared/celioPage.abstact';

enum StepsState {
  ChooseEmulator = 0,
  DownloadPlugin = 1,
  WaitForLocalServer = 2,
  JoiningSession = 3,
  WaitingForPartner = 4,
  SettingLinkMode = 5,
  Ready = 6
}

@Component({
  selector: 'app-tradeEmu',
  standalone: true,
  imports: [
    NgIf,
    NgClass,
    ToastComponent
  ],
  templateUrl: './emulatorOnlineLink.component.html'
})
export class EmulatorOnlineLinkComponent extends CelioPageAbstract<StepsState>{

  @ViewChild(ToastComponent) toast!: ToastComponent;

  protected StepsState = StepsState;
  protected readonly SupportedEmulators = SupportedEmulators;

  protected closing: boolean = false;
  protected timeoutId: number | undefined; //this is trash, pls fix

  private partnerSubscription: Subscription
  private linkSessionCloseSubscription: Subscription

  private linkSession: LinkExchangeSession | undefined = undefined;
  private statusEmitterWebsocket: StatusEmitterWebsocket | undefined = undefined;
  protected sessionId: string | undefined = "";

  constructor(cd: ChangeDetectorRef,
      private playerSessionService: PlayerSessionService,
      private socket: WebSocketService,
      private emulatorSelection: EmulatorSelectionService
  ) {
    super(cd);
    this.stepState = StepsState.ChooseEmulator;

    this.partnerSubscription = this.playerSessionService.partnerEvents$.subscribe(partnerConnected => {
      if (partnerConnected) {
        console.log("Partner connected");
        this.advanceLinkState(StepsState.SettingLinkMode);
      }
      else {
        if (this.stepState == StepsState.Ready) {
          this.statusEmitterWebsocket?.destroy();
          this.toast.show("Partner has disconnected, please create a new Session");
        } else {
          this.advanceLinkState(StepsState.WaitingForPartner);
          this.toast.show("Partner has disconnected");
        }
      }
    });

    this.linkSessionCloseSubscription = this.playerSessionService.sessionClose$.subscribe(() => {
      this.toast.show("Session has ended");
      this.statusEmitterWebsocket?.destroy();
    });
  }

  ngOnInit() {
    if (this.emulatorSelection.isSetupComplete()) { this.startWaitForServer() }
  }

  ngOnDestroy() {
    this.closing = true;
    this.partnerSubscription.unsubscribe();
    this.linkSessionCloseSubscription.unsubscribe();
    this.statusEmitterWebsocket?.destroy();
  }

  emulatorSelected(emulator: SupportedEmulators) {
    this.emulatorSelection.setSelectedEmulator(emulator)
    this.advanceLinkState(StepsState.DownloadPlugin)
  }

  private cleanup() {
    console.log("Cleanup");
    this.playerSessionService.leaveSession();
    this.socket.disconnect();
    this.linkSession?.destroy();
    if (!this.closing) this.startWaitForServer();
  }

  startWaitForServer(delay: number = 1000) {
    this.emulatorSelection.setSetupComplete(true)
    if (this.stepState == StepsState.WaitForLocalServer) return;

    this.advanceLinkState(StepsState.WaitForLocalServer)
    this.statusEmitterWebsocket = new StatusEmitterWebsocket();
    this.statusEmitterWebsocket.close$()
      .pipe(take(1))
      .subscribe(() => {this.cleanup()});

    this.timeoutId = setTimeout(() => {
      this.statusEmitterWebsocket?.open().then(() => {
        this.timeoutId = undefined;
        this.advanceLinkState(StepsState.JoiningSession)
      })
    }, delay)
  }

  async enterSession(userSessionId?: string) {
    if (!await this.socket.connect()) {
      this.toast.show("Could not connect to Server", 'error', 4000)
      console.error("Could not connect to Server");
    }
    this.playerSessionService.enterSession(userSessionId).then(session => {
      this.createLinkSession();
      if (userSessionId) {
        this.advanceLinkState(StepsState.SettingLinkMode);
      } else {
        this.advanceLinkState(StepsState.WaitingForPartner);
      }
      this.sessionId = session.id;
    }).catch(error => {
      this.toast.show(error, 'error', 4000)
      console.error(error);
      this.statusEmitterWebsocket?.destroy();
    })
  }

  start() {
    LinkDeviceUtils.tryEnableLinkMode(this.statusEmitterWebsocket!)
      .then(() => {
        this.advanceLinkState(StepsState.Ready);
      })
      .catch(error => {
        this.toast.show(error, 'error', 4000)
        console.error(error);
      })
  }

  leaveSession() {
    this.statusEmitterWebsocket?.destroy();
  }

  createLinkSession() {
    this.linkSession?.destroy();
    if (this.statusEmitterWebsocket == undefined) return;
    this.linkSession = new LinkExchangeSession(new CommandEmitterSocketIO(this.socket), this.statusEmitterWebsocket);
  }

  copySessionId() {
    navigator.clipboard.writeText(this.sessionId!);
    this.toast.show("Session Id copied", 'info', 1800)
  }

  disconnect(): void {
    this.statusEmitterWebsocket?.destroy();
  }
}
