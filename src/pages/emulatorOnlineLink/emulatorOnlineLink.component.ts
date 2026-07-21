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
import {ToastService} from '../../services/toast.service';

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
    CelioSessionComponent
  ],
  templateUrl: './emulatorOnlineLink.component.html'
})
export class EmulatorOnlineLinkComponent extends CelioPageAbstract<StepsState>{
  @ViewChild(CelioSessionComponent) sessionPanel!: CelioSessionComponent;

  protected StepsState = StepsState;
  protected readonly SupportedEmulators = SupportedEmulators;

  protected closing: boolean = false;
  protected timeoutId: number | undefined; //this is trash, pls fix

  private statusEmitterWebsocket: StatusEmitterWebsocket | undefined = undefined;

  constructor(cd: ChangeDetectorRef, private toastService: ToastService, private socket: WebSocketService, private emulatorSelection: EmulatorSelectionService) {
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
          } else {
            this.advanceLinkState(StepsState.WaitingForPartner);
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

    this.closing = false;
    this.timeoutId = setTimeout(() => {
      this.statusEmitterWebsocket?.open().then(() => {
        this.timeoutId = undefined;
        this.statusEmitterWebsocket?.checkVersion().then((passedCheck) => {
          console.log("Passed version check: " + passedCheck);
          if (passedCheck) {
            this.advanceLinkState(StepsState.JoiningSession)
          } else {
            this.emulatorSelection.setSetupComplete(false);
            this.closing = true;
            this.statusEmitterWebsocket?.destroy();
            this.advanceLinkState(StepsState.DownloadPlugin)
            this.toastService.show("Please download the newest script version.", 'error', 3000)
          }
        })

      })
    }, delay)
  }

  start() {
    LinkDeviceUtils.tryEnableLinkMode(this.statusEmitterWebsocket!)
      .then(() => {
        this.advanceLinkState(StepsState.Ready);
      })
      .catch(error => {
        this.toastService.show(error, 'error', 4000)
        this.statusEmitterWebsocket?.destroy();
        console.error(error);
      })
  }

  disconnect(): void {
    this.statusEmitterWebsocket?.destroy();
  }
}
