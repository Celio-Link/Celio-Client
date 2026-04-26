import {Component, inject, ChangeDetectorRef, HostListener, ViewChild} from '@angular/core';
import {NgClass, NgIf} from '@angular/common';
import {CommandType, DataArray, LinkDeviceService, LinkStatus, Mode} from '../../services/linkdevice.service';
import {Subscription, take} from 'rxjs';
import {environment} from '../../environments/environment';
import {LinkdeviceExchangeSession} from '../../shared/linkdeviceExchangeSession';
import {WebsocketBridge} from '../../shared/bridges/websocket.bridge';
import {LinkDeviceUtils} from '../../shared/linkDeviceUtils';
import {ToastComponent} from '../../component/toast.component';

enum StepsState {
  ConnectingCelioDevice = 0,
  ChooseEmulator = 1,
  DownloadPlugin = 2,
  WaitForLocalServer = 3,
  SettingLinkMode = 4,
  Ready = 5,
}

enum SupportedEmulators {
  mGBA = 0,
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
export class EmulatorLinkComponent {

  @ViewChild(ToastComponent) toast!: ToastComponent;

  private linkDeviceService = inject(LinkDeviceService)
  protected linkDeviceConnected = false;

  protected stepState: StepsState = StepsState.ConnectingCelioDevice
  protected StepsState = StepsState;

  protected webUsbError: boolean = false;
  protected closing: boolean = false;
  protected timeoutId: number | undefined; //this is trash, pls fix

  private linkSession: LinkdeviceExchangeSession | undefined = undefined;

  private disconnectSubscription: Subscription;
  private statusSubscription: Subscription

  constructor(private cd: ChangeDetectorRef) {
    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(() => {
      this.linkDeviceConnected = false;
      this.stepState = StepsState.ConnectingCelioDevice;
      this.linkSession?.destroy();
      this.cd.detectChanges();
    })

    this.statusSubscription = this.linkDeviceService.statusEvents$.subscribe(statusEvents => {
      console.log("Status: " + LinkStatus[statusEvents]);
      if (statusEvents === LinkStatus.LinkClosed) {
        this.linkSession?.destroy();
        this.startWaitForServer(1500);
        this.cd.detectChanges();
      }
    });
  }

  ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      this.stepState = StepsState.ChooseEmulator;
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
          this.stepState = StepsState.ChooseEmulator;
          this.cd.detectChanges();
        }
      })
  }

  emulatorSelected(emulator: SupportedEmulators) {
    this.stepState = StepsState.DownloadPlugin;
    this.cd.detectChanges();
  }

  startWaitForServer(delay: number = 1000) {
    if (this.stepState == StepsState.WaitForLocalServer) return;

    this.stepState = StepsState.WaitForLocalServer;
    this.cd.detectChanges();
    let websocketBridge: WebsocketBridge = new WebsocketBridge();
    websocketBridge.close$()
      .pipe(take(1))
      .subscribe(() => {
        if (this.linkDeviceService.isConnected()) {
          this.linkDeviceService.sendCommand(CommandType.Cancel);
          if (!this.closing) this.startWaitForServer();
        }
      });
    this.timeoutId = setTimeout(() => {
      websocketBridge.open().then(() => {
        this.timeoutId = undefined;
        this.stepState = StepsState.SettingLinkMode;
        this.cd.detectChanges();
        this.linkSession?.destroy();
        this.linkSession = new LinkdeviceExchangeSession(websocketBridge, this.linkDeviceService);
      })
    }, delay)
  }

  start() {
    LinkDeviceUtils.tryEnableLinkMode(this.linkDeviceService)
      .then(() => {
        this.stepState = StepsState.Ready;
        this.cd.detectChanges();
      })
      .catch(error => {
        this.toast.show(error, 'error', 4000)
        console.error(error);
        this.disconnect();
        this.linkSession?.destroy();
      })
  }

  disconnect(): void {
    this.linkDeviceService.sendCommand(CommandType.Cancel);
    this.linkSession?.destroy();
    this.startWaitForServer(1500);
    this.cd.detectChanges();
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

  protected readonly SupportedEmulators = SupportedEmulators;
}
