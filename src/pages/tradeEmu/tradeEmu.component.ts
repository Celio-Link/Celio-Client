import {Component, inject, ChangeDetectorRef} from '@angular/core';
import {NgClass, NgForOf, NgIf} from '@angular/common';
import {CommandType, DataArray, LinkDeviceService, LinkStatus, Mode} from '../../services/linkdevice.service';
import {Subscription} from 'rxjs';
import {PkmnFile} from './pkmnFile';

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

  private disconnectSubscription: Subscription;
  private statusSubscription: Subscription

  constructor(private cd: ChangeDetectorRef) {
    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(disconnect => {
      this.linkDeviceConnected = false;
      this.stepState = StepsState.ConnectingCelioDevice;
      this.cd.detectChanges();
    })

    this.statusSubscription = this.linkDeviceService.statusEvents$.subscribe(statusEvents => {
      console.log(statusEvents);
    });
  }

  ngOnInit() {
    if (this.linkDeviceService.isConnected()) {
      this.stepState = StepsState.SelectingPokemon;
    }

    window.onbeforeunload = () => this.ngOnDestroy();
  }

  ngOnDestroy() {
    this.disconnectSubscription.unsubscribe();
    this.statusSubscription.unsubscribe();
    this.linkDeviceService.disconnect()
  }

  connect(): void {
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
        //subscription.unsubscribe();
        reject(new Error('Timed out waiting for device to get ready'));
      }, 2000000);

      // const subscription = this.linkDeviceService.statusEvents$.subscribe(statusEvent => {
      //   console.log(statusEvent);
      //   if (statusEvent === LinkStatus.DeviceReady) {
      //     clearTimeout(timeout);
      //     subscription.unsubscribe();
      //     resolve(true);
      //   }
      // });

      this.linkDeviceService.sendCommand(CommandType.Cancel).then(ok => {
        if (!ok) {
          clearTimeout(timeout);
          //subscription.unsubscribe();
          reject(new Error('Failed to send Cancel command'));
        }
      });

      let args: Uint8Array = new Uint8Array(1);
      args[0] = Mode.tradeEmu;
      this.linkDeviceService.sendCommand(CommandType.SetMode, args).then(ok => {
        if (!ok) {
          clearTimeout(timeout);
          //subscription.unsubscribe();
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
    return this.stepState == step
  }
}
