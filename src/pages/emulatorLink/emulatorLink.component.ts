import {Component, inject, ChangeDetectorRef, ViewChild} from '@angular/core';
import {NgClass, NgIf} from '@angular/common';
import {CommandType, LinkStatus} from '../../shared/linkExchange/common';
import {LinkDeviceService} from '../../services/linkdevice.service';
import {Subscription, take} from 'rxjs';
import {LinkExchangeSession} from '../../shared/linkExchange/linkExchangeSession';
import {CommandEmitterWebsocket} from '../../shared/linkExchange/commandEmitter/commandEmitter.websocket';
import {LinkDeviceUtils} from '../../shared/linkDeviceUtils';
import {ToastComponent} from '../../component/toast.component';
import {StatusEmitterLinkDevice} from '../../shared/linkExchange/statusEmitter/statusEmitter.linkDevice';
import {CelioPageAbstract} from '../shared/celioPage.abstact';
import {EmulatorSelectionService, SupportedEmulators} from '../../services/emulatorSelection.service';


enum StepsState {
  ConnectingCelioDevice = 0,
  ChooseEmulator = 1,
  DownloadPlugin = 2,
  WaitForLocalServer = 3,
  SettingLinkMode = 4,
  Ready = 5,
}

@Component({
  selector: 'app-tradeEmu',
  standalone: true,
  imports: [
    NgIf,
    NgClass,
    ToastComponent
  ],
  templateUrl: './emulatorLink.component.html'
})
export class EmulatorLinkComponent extends CelioPageAbstract<StepsState>{

  @ViewChild(ToastComponent) toast!: ToastComponent;

  private linkDeviceService = inject(LinkDeviceService)
  protected linkDeviceConnected = false;

  protected StepsState = StepsState;
  protected readonly SupportedEmulators = SupportedEmulators;

  protected webUsbError: boolean = false;
  protected closing: boolean = false;
  protected timeoutId: number | undefined; //this is trash, pls fix

  private linkSession: LinkExchangeSession | undefined = undefined;

  private disconnectSubscription: Subscription;
  private statusSubscription: Subscription

  constructor(cd: ChangeDetectorRef, private emulatorSelection: EmulatorSelectionService) {
    super(cd);
    this.stepState = StepsState.ConnectingCelioDevice;

    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(() => {
      this.linkDeviceConnected = false;
      this.advanceLinkState(StepsState.ConnectingCelioDevice);
      this.linkSession?.destroy();
      this.linkSession = undefined;
    })

    this.statusSubscription = this.linkDeviceService.statusEvents$.subscribe(statusEvents => {
      console.log("Status: " + LinkStatus[statusEvents]);
      if (statusEvents === LinkStatus.LinkClosed) {

        //FIXME When socket is closed by server, this and closed$ is called. Clean up closing states
        if (this.stepState == StepsState.WaitForLocalServer) return;
        this.linkSession?.destroy();
        this.linkSession = undefined;
        this.startWaitForServer(1500);
      }
    });
  }

  ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      if (this.emulatorSelection.isSetupComplete()) {
        this.startWaitForServer()
      } else {
        this.advanceLinkState(StepsState.ChooseEmulator);
      }
    }
  }

  ngOnDestroy() {
    this.closing = true;
    clearTimeout(this.timeoutId);
    this.disconnectSubscription.unsubscribe();
    this.statusSubscription.unsubscribe();
    this.linkSession?.destroy();
  }

  connect(): void {
    if (navigator.usb == undefined) {
      this.webUsbError = true;
      return;
    }

    this.linkDeviceService.connectDevice()
      .then(isConnected => {
        this.linkDeviceConnected = isConnected
        if (isConnected) {
          if (this.emulatorSelection.isSetupComplete()) {
            this.startWaitForServer()
          } else {
            this.advanceLinkState(StepsState.ChooseEmulator);
          }
        }
      })
  }

  emulatorSelected(emulator: SupportedEmulators) {
    this.emulatorSelection.setSelectedEmulator(emulator)
    this.advanceLinkState(StepsState.DownloadPlugin)
  }

  startWaitForServer(delay: number = 1000) {
    this.emulatorSelection.setSetupComplete(true)
    console.log("Start Wait for Server");
    this.advanceLinkState(StepsState.WaitForLocalServer)
    let commandEmitterWebsocket: CommandEmitterWebsocket = new CommandEmitterWebsocket();
    if (this.linkSession != undefined) { this.linkSession?.destroy(); }
    this.linkSession = new LinkExchangeSession(commandEmitterWebsocket, new StatusEmitterLinkDevice(this.linkDeviceService));
    commandEmitterWebsocket.close$()
      .pipe(take(1))
      .subscribe(() => {
        if (this.linkDeviceService.isConnected()) {
          this.linkDeviceService.sendCommand(CommandType.Cancel);
          if (!this.closing) this.startWaitForServer();
        }
      });
    this.timeoutId = setTimeout(() => {
      commandEmitterWebsocket.open().then(() => {
        this.timeoutId = undefined;
        this.advanceLinkState(StepsState.SettingLinkMode);
      })
    }, delay)
  }

  start() {
    LinkDeviceUtils.tryEnableLinkMode(new StatusEmitterLinkDevice(this.linkDeviceService))
      .then(() => {
        this.advanceLinkState(StepsState.Ready);
      })
      .catch(error => {
        this.toast.show(error, 'error', 4000)
        console.error(error);
        this.disconnect();
        this.linkSession?.destroy();
        this.linkSession = undefined;
      })
  }

  disconnect(): void {
    this.linkDeviceService.sendCommand(CommandType.Cancel);
  }
}
