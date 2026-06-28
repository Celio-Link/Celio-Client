import {Component, ChangeDetectorRef, ViewChild} from '@angular/core';
import {NgClass, NgIf} from '@angular/common';
import {Subscription, take} from 'rxjs';
import {LinkExchangeSession} from '../../shared/linkExchange/linkExchangeSession';
import {EmulatorSelectionService, SupportedEmulators} from '../../services/emulatorSelection.service';
import {LinkDeviceUtils} from '../../shared/linkDeviceUtils';
import {ToastComponent} from '../../component/toast/toast.component';
import {PlayerSessionService} from '../../services/playersession.service';
import {WebSocketService} from '../../services/websocket.service';
import {StatusEmitterWebsocket} from '../../shared/linkExchange/statusEmitter/statusEmitter.websocket';
import {CommandEmitterSocketIO} from '../../shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {CelioPageAbstract} from '../shared/celioPage.abstact';
import {CelioSessionComponent, SessionState} from '../../component/panel/session/session.compomemt';
import {StatusEmitterLinkDevice} from '../../shared/linkExchange/statusEmitter/statusEmitter.linkDevice';

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
    ToastComponent,
    CelioSessionComponent
  ],
  templateUrl: './emulatorOnlineLink.component.html'
})
export class EmulatorOnlineLinkComponent extends CelioPageAbstract<StepsState>{

  @ViewChild(ToastComponent) toast!: ToastComponent;
  @ViewChild(CelioSessionComponent) sessionPanel!: CelioSessionComponent;

  protected StepsState = StepsState;
  protected readonly SupportedEmulators = SupportedEmulators;

  protected closing: boolean = false;
  protected timeoutId: number | undefined; //this is trash, pls fix

  private statusEmitterWebsocket: StatusEmitterWebsocket | undefined = undefined;

  constructor(cd: ChangeDetectorRef, private socket: WebSocketService, private emulatorSelection: EmulatorSelectionService) {
    super(cd);
    this.stepState = StepsState.ChooseEmulator;
  }

  ngOnInit() {
    if (this.emulatorSelection.isSetupComplete()) { this.startWaitForServer() }
  }

  ngAfterViewInit() {
    this.sessionPanel.createSessionEvent.subscribe(() => {
      if (this.statusEmitterWebsocket == undefined) return;
      this.sessionPanel.setLinkSession(new LinkExchangeSession(new CommandEmitterSocketIO(this.socket), this.statusEmitterWebsocket))
    })
    this.sessionPanel.sessionStateChange.subscribe(state => {
      switch (state) {
        case SessionState.Start:
          this.advanceLinkState(StepsState.JoiningSession);
          this.statusEmitterWebsocket?.destroy();
          break;
        case SessionState.Waiting:
          if (this.stepState == StepsState.Ready) {
            this.statusEmitterWebsocket?.destroy();
            this.toast.show("Partner has disconnected, please create a new Session");
          } else {
            this.advanceLinkState(StepsState.WaitingForPartner);
            this.toast.show("Partner has disconnected");
          }
          break;
        case SessionState.Commit: this.advanceLinkState(StepsState.SettingLinkMode); break;
      }
    })
  }

  ngOnDestroy() {
    this.closing = true;
    this.statusEmitterWebsocket?.destroy();
  }

  emulatorSelected(emulator: SupportedEmulators) {
    this.emulatorSelection.setSelectedEmulator(emulator)
    this.advanceLinkState(StepsState.DownloadPlugin)
  }

  private cleanup() {
    console.log("Cleanup");
    this.sessionPanel.leaveSession();
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

  disconnect(): void {
    this.statusEmitterWebsocket?.destroy();
  }
}
