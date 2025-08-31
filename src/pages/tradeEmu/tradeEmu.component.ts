import {Component, inject, ChangeDetectorRef} from '@angular/core';
import {NgClass, NgForOf, NgIf} from '@angular/common';
import {CommandType, DataArray, LinkDeviceService, Mode} from '../../services/linkdevice.service';
import {Subscription} from 'rxjs';

enum StepsState {
  Start = 0,
  ConnectedCelioDevice = 1,
  SessionJoined = 2,
  PartnerResponded = 3,
  LinkModeSet = 4,
  Ready = 5
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

  protected stepState: StepsState = StepsState.Start

  protected pkmFiles: File[] = [];

  private disconnectSubscription: Subscription;
  private statusSubscription: Subscription

  constructor(private cd: ChangeDetectorRef) {
    this.disconnectSubscription = this.linkDeviceService.disconnectEvents$.subscribe(disconnect => {
      this.linkDeviceConnected = false;
      this.stepState = StepsState.Start;
      this.cd.detectChanges();
    })

    this.statusSubscription = this.linkDeviceService.statusEvents$.subscribe(statusEvents => {
      //this.handleLinkDeviceStatus(statusEvents);
    });
  }

  ngOnInit() {
    this.linkDeviceConnected = this.linkDeviceService.isConnected()
  }

  ngOnDestroy() {
    this.disconnectSubscription.unsubscribe();
    this.statusSubscription.unsubscribe();
  }

  connect(): void {
    this.linkDeviceService.connectDevice()
      .then(isConnected => {
          this.linkDeviceConnected = isConnected
          if (isConnected) {
            this.stepState = StepsState.ConnectedCelioDevice;
          }
        }
      )
  }

  slotSelected($event: Event) {
    const input = $event!.target as HTMLInputElement; // typecast to HTMLInputElement
    if (input.files && input.files.length > 0 && input.files[0].size == 100) {
      this.pkmFiles.push(input.files[0]);
      input.value = '';
    }
  }

  async enableTradeMode():Promise<boolean> {
    //this.stepState = StepsState.LinkModeSet
    let args: Uint8Array = new Uint8Array(1);
    args[0] = Mode.tradeEmu;
    return this.linkDeviceService.sendCommand(CommandType.SetMode, args);
  }

  async upload()
  {
    let success: boolean = await this.enableTradeMode();
    if (!success) return;
    for (const file of this.pkmFiles) {
      const blob = await file.arrayBuffer()
      const bytes = new Uint8Array(blob);
      await this.linkDeviceService.sendDataRaw(bytes.slice(0, 50))
      await this.linkDeviceService.sendDataRaw(bytes.slice(50))
    }
  }

  remove(index: number) {
    this.pkmFiles = this.pkmFiles.filter((_, i) => i !== index);
  }
}
