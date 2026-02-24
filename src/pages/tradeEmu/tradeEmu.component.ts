import {Component, inject, ChangeDetectorRef, HostListener} from '@angular/core';
import {NgClass, NgForOf, NgIf} from '@angular/common';
import {CommandType, DataArray, LinkDeviceService, LinkStatus, Mode} from '../../services/linkdevice.service';
import {Subscription} from 'rxjs';
import {PkmnFile} from './pkmnFile';
import {environment} from '../../environments/environment';

enum StepsState {
  ConnectingCelioDevice = 0,
  SelectingPokemon = 1,
  UploadingPokemon = 2,
  Ready = 3,
}

@Component({
  selector: 'app-tradeEmu',
  standalone: true,
  imports: [
    NgIf,
    NgClass,
    NgForOf
  ],
  templateUrl: './tradeEmu.component.html'
})
export class TradeEmuComponent {
  private linkDeviceService = inject(LinkDeviceService)
  protected linkDeviceConnected = false;

  protected stepState: StepsState = StepsState.ConnectingCelioDevice
  protected StepsState = StepsState;

  protected pkmFiles: PkmnFile[] = [];
  protected webUsbError: boolean = false;

  private disconnectSubscription: Subscription;
  private statusSubscription: Subscription

  constructor(private cd: ChangeDetectorRef) {
    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(disconnect => {
      this.linkDeviceConnected = false;
      this.stepState = StepsState.ConnectingCelioDevice;
      this.pkmFiles = [];
      this.cd.detectChanges();
    })

    this.statusSubscription = this.linkDeviceService.statusEvents$.subscribe(statusEvents => {
      console.log("Status: " + LinkStatus[statusEvents]);
      if (statusEvents === LinkStatus.EmuTradeSessionFinished) {
        this.pkmFiles = [];
        this.stepState = StepsState.SelectingPokemon;
        this.cd.detectChanges();
      }
    });
  }

  ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      this.stepState = StepsState.SelectingPokemon;
    }
  }

  ngOnDestroy() {
    this.disconnectSubscription.unsubscribe();
    this.statusSubscription.unsubscribe();
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
            this.stepState = StepsState.SelectingPokemon;
            this.cd.detectChanges();
          }
        }
      )
  }

  disconnect(): void {
    this.linkDeviceService.sendCommand(CommandType.Cancel);
    this.pkmFiles = [];
    this.stepState = StepsState.SelectingPokemon;
    this.cd.detectChanges();
  }

  slotSelected($event: Event) {
    const input = $event!.target as HTMLInputElement; // typecast to HTMLInputElement
    if (input.files && input.files.length > 0 && input.files[0].size == 100) {
      PkmnFile.fromFile(input.files[0]).then(pkmFile => {
        this.pkmFiles.push(pkmFile);
        input.value = '';
      })
    }
  }

  async enableTradeMode():Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error('Timed out waiting for device to get ready'));
      }, 2000);

      const subscription = this.linkDeviceService.statusEvents$.subscribe(statusEvent => {
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
      args[0] = Mode.tradeEmu;
      this.linkDeviceService.sendCommand(CommandType.SetMode, args).then(ok => {
        if (!ok) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          reject(new Error('Failed to send SetMode command'));
        }
      })
    });
  }

  confirmSelection() {
    this.stepState = StepsState.UploadingPokemon;
  }

  async upload()
  {
    let success = await this.enableTradeMode();
    if (!success) return;
    for (const file of this.pkmFiles) {
      const bytes = file.encryptedBuffer;
      await this.linkDeviceService.sendDataRaw(bytes.slice(0, 50))
      await this.linkDeviceService.sendDataRaw(bytes.slice(50))
    }
    this.stepState = StepsState.Ready;
  }

  remove(index: number) {
    this.pkmFiles = this.pkmFiles.filter((_, i) => i !== index);
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
}
