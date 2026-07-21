import {Component, inject, ChangeDetectorRef, ViewChild} from '@angular/core';
import {NgClass, NgIf} from '@angular/common';
import {CommandType, LinkStatus} from '../../shared/linkExchange/common';
import {LinkDeviceService} from '../../services/linkdevice.service';
import {Subscription, take} from 'rxjs';
import {LinkExchangeSession} from '../../shared/linkExchange/linkExchangeSession';
import {CommandEmitterWebsocket} from '../../shared/linkExchange/commandEmitter/commandEmitter.websocket';
import {LinkDeviceUtils} from '../../shared/linkDeviceUtils';
import {ToastComponent} from '../../component/toast/toast.component';
import {StatusEmitterLinkDevice} from '../../shared/linkExchange/statusEmitter/statusEmitter.linkDevice';
import {CelioPageAbstract} from '../shared/celioPage.abstact';
import {EmulatorSelectionService, SupportedEmulators} from '../../services/emulatorSelection.service';
import {CelioConnectionStatusComponent} from '../../component/panel/connect/connect.component';
import {ToastService} from '../../services/toast.service';


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
    CelioConnectionStatusComponent
  ],
  templateUrl: './emulatorLink.component.html'
})
export class EmulatorLinkComponent extends CelioPageAbstract<StepsState>{

  @ViewChild(CelioConnectionStatusComponent) connectionPanel!: CelioConnectionStatusComponent;

  private linkDeviceService = inject(LinkDeviceService)
  protected linkDeviceConnected = false;

  protected StepsState = StepsState;
  protected readonly SupportedEmulators = SupportedEmulators;

  protected closing: boolean = false;
  protected timeoutId: number | undefined; //this is trash, pls fix

  private linkSession: LinkExchangeSession | undefined = undefined;

  private disconnectSubscription: Subscription;
  private statusSubscription: Subscription

  constructor(cd: ChangeDetectorRef, private toastService: ToastService, private emulatorSelection: EmulatorSelectionService) {
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
        if (this.stepState == StepsState.WaitForLocalServer) return;
        this.linkSession?.destroy();
        this.linkSession = undefined;
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

  ngAfterViewInit() {
    this.connectionPanel.next.subscribe(() => { this.advanceLinkState(StepsState.ChooseEmulator);})
  }

  ngOnDestroy() {
    this.closing = true;
    clearTimeout(this.timeoutId);
    this.disconnectSubscription.unsubscribe();
    this.statusSubscription.unsubscribe();
    this.linkSession?.destroy();
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
          console.log("Starting after Close$ fired");
          if (!this.closing) this.startWaitForServer();
        }
      });

    this.closing = false;
    this.timeoutId = setTimeout(() => {
      commandEmitterWebsocket.open().then(() => {
        this.timeoutId = undefined;
        commandEmitterWebsocket?.checkVersion().then((passedCheck) => {
          console.log("Passed version check: " + passedCheck);
          if (passedCheck) {
            this.advanceLinkState(StepsState.SettingLinkMode)
          } else {
            this.emulatorSelection.setSetupComplete(false);
            this.closing = true;
            this.linkSession?.destroy();
            this.advanceLinkState(StepsState.DownloadPlugin)
            this.toastService.show("Please download the newest script version.", 'error', 3000)
          }
        })
      })
    }, delay)
  }

  start() {
    LinkDeviceUtils.tryEnableLinkMode(new StatusEmitterLinkDevice(this.linkDeviceService))
      .then(() => {
        this.advanceLinkState(StepsState.Ready);
      })
      .catch(error => {
        this.toastService.show(error, 'error', 4000)
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
