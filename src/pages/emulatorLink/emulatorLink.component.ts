import {Component, inject, ChangeDetectorRef, ViewChild} from '@angular/core';
import {NgClass, NgIf} from '@angular/common';
import {CancelCommand, LinkStatus} from '../../shared/linkExchange/common';
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
import {EmulatorComponent} from '../../component/emulator/emulator.component';
import {EmulatorService} from '../../services/emulator.service';
import {StatusEmitterEmulator} from '../../shared/linkExchange/statusEmitter/statusEmitter.emulator';
import {LocalLinkSession} from '../../shared/linkExchange/localLinkSession';


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
    CelioConnectionStatusComponent,
    EmulatorComponent
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

  protected emulatorService = inject(EmulatorService)
  /** The emulator in the page was chosen: it links with the GBA on the GB-Link here, without a server. */
  protected browser = false;
  private localLink: LocalLinkSession | null = null;
  private localLinkClosed: Subscription | null = null;

  private disconnectSubscription: Subscription;
  private statusSubscription: Subscription

  constructor(cd: ChangeDetectorRef, private toastService: ToastService, private emulatorSelection: EmulatorSelectionService) {
    super(cd);
    this.stepState = StepsState.ConnectingCelioDevice;

    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(() => {
      this.linkDeviceConnected = false;
      this.endBrowserLink();
      this.browser = false;
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
      if (this.emulatorSelection.getSelectedEmulator() === SupportedEmulators.browser && this.emulatorService.game()) {
        this.browser = true;
        this.advanceLinkState(StepsState.SettingLinkMode);
      } else if (this.emulatorSelection.isSetupComplete()) {
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
    this.endBrowserLink();
  }

  emulatorSelected(emulator: SupportedEmulators) {
    this.emulatorSelection.setSelectedEmulator(emulator)
    this.advanceLinkState(StepsState.DownloadPlugin)
  }

  /** The emulator in the page needs no script or server: it can start as soon as its game runs. */
  protected async browserSelected(): Promise<void> {
    if (!await this.emulatorService.prepare()) {
      this.toastService.show('The emulator didn\'t load. Check your connection and try again.', 'error', 5000);
      return;
    }
    this.emulatorSelection.setSelectedEmulator(SupportedEmulators.browser);
    this.browser = true;
    this.advanceLinkState(StepsState.SettingLinkMode);
  }

  /** Closing the emulator goes back to choosing one. */
  protected emulatorClosed(): void {
    this.endBrowserLink();
    this.browser = false;
    this.emulatorSelection.setSelectedEmulator(SupportedEmulators.none);
    this.advanceLinkState(StepsState.ChooseEmulator);
  }

  /** The emulator needs its game before the link mode can start. */
  protected gameMissing(): boolean {
    return this.browser && !this.emulatorService.game();
  }

  private startBrowserLink(): void {
    const adapter = this.emulatorService.linkAdapter;
    if (!adapter || this.gameMissing() || this.localLink) return;
    // The GBA on the GB-Link is seat 0 and leads: a throttled page then slows only its own game, never the GBA's link
    const devices = [new StatusEmitterLinkDevice(this.linkDeviceService), new StatusEmitterEmulator(adapter)];
    const localLink = this.localLink = new LocalLinkSession(devices);
    // Both games left the room: the next visit starts with Start again
    this.localLinkClosed = localLink.closed$.subscribe(() => this.endBrowserLink());
    Promise.all(devices.map(device => LinkDeviceUtils.tryEnableLinkMode(device)))
      .then(() => {
        if (this.localLink === localLink) this.advanceLinkState(StepsState.Ready);
      })
      .catch(error => {
        this.toastService.show(String(error?.message ?? error), 'error', 4000);
        this.endBrowserLink();
      });
  }

  /** Ends the link between the GBA and the game in the page. */
  private endBrowserLink(): void {
    if (!this.localLink) return;
    this.localLinkClosed?.unsubscribe();
    this.localLinkClosed = null;
    this.localLink.destroy();
    this.localLink = null;
    this.linkDeviceService.sendCommand(new CancelCommand());
    this.emulatorService.linkAdapter?.command(new CancelCommand());
    if (this.browser && this.hasReached(StepsState.SettingLinkMode)) this.advanceLinkState(StepsState.SettingLinkMode);
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
          this.linkDeviceService.sendCommand(new CancelCommand());
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
    if (this.browser) {
      this.startBrowserLink();
      return;
    }
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
    if (this.browser) {
      this.endBrowserLink();
      return;
    }
    this.linkDeviceService.sendCommand(new CancelCommand());
  }
}
