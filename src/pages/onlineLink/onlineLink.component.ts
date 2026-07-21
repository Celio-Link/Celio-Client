import {ChangeDetectorRef, Component, inject, ViewChild} from '@angular/core';
import {NgClass, NgIf} from '@angular/common';

import {CommandType} from '../../shared/linkExchange/common';

import {Subscription} from 'rxjs';
import {WebSocketService} from '../../services/websocket.service';
import {LinkExchangeSession} from '../../shared/linkExchange/linkExchangeSession';
import {LinkDeviceUtils} from '../../shared/linkDeviceUtils';
import {CommandEmitterSocketIO} from '../../shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import {LinkDeviceService} from '../../services/linkdevice.service';
import {StatusEmitterLinkDevice} from '../../shared/linkExchange/statusEmitter/statusEmitter.linkDevice';
import {CelioPageAbstract} from '../shared/celioPage.abstact';
import {CelioConnectionStatusComponent} from '../../component/panel/connect/connect.component';
import {CelioSessionComponent, SessionState} from '../../component/panel/session/session.compomemt';
import {ToastService} from '../../services/toast.service';

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
    CelioConnectionStatusComponent,
    CelioSessionComponent
  ],
  templateUrl: './onlineLink.component.html'
})

export class OnlineLinkComponent extends CelioPageAbstract<StepsState>{

  @ViewChild(CelioConnectionStatusComponent) connectionPanel!: CelioConnectionStatusComponent;
  @ViewChild(CelioSessionComponent) sessionPanel!: CelioSessionComponent;

  private linkDeviceService = inject(LinkDeviceService)
  protected StepsState = StepsState;
  private disconnectSubscription: Subscription;


  constructor(cd: ChangeDetectorRef, private toastService: ToastService, private socket: WebSocketService) {
    super(cd);
    this.stepState = StepsState.ConnectingCelioDevice;

    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(disconnect => {
      this.sessionPanel.leaveSession()
      this.advanceLinkState(StepsState.ConnectingCelioDevice);
    })
  }

  ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      this.advanceLinkState(StepsState.JoiningSession);
    }
  }

  ngAfterViewInit() {
    this.connectionPanel.next.subscribe(() => { this.advanceLinkState(StepsState.JoiningSession);})
    this.sessionPanel.createSessionEvent.subscribe(() => {
      this.sessionPanel.setLinkSession(new LinkExchangeSession(new CommandEmitterSocketIO(this.socket), new StatusEmitterLinkDevice(this.linkDeviceService)))
    })
    this.sessionPanel.sessionStateChange.subscribe(state => {
      switch (state) {
        case SessionState.Start: this.advanceLinkState(StepsState.JoiningSession); break;
        case SessionState.Waiting: this.advanceLinkState(StepsState.WaitingForPartner); break;
        case SessionState.Commit: this.advanceLinkState(StepsState.SettingLinkMode); break;
      }
    })
  }

  ngOnDestroy() {
    this.disconnectSubscription.unsubscribe();
    this.sessionPanel.leaveSession()
  }

  start() {
    LinkDeviceUtils.tryEnableLinkMode(new StatusEmitterLinkDevice(this.linkDeviceService))
      .then(() => {
        this.advanceLinkState(StepsState.Ready);
      })
      .catch(error => {
        this.toastService.show(error, 'error', 4000)
        console.error(error);
        this.disconnectCelioDevice();
      })
  }

  disconnectCelioDevice(): void {
    this.linkDeviceService.sendCommand(CommandType.Cancel);
    this.sessionPanel.leaveSession()
  }
}
