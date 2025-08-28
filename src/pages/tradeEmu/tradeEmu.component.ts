import {Component, inject} from '@angular/core';
import {NgClass, NgForOf, NgIf} from '@angular/common';
import {DataArray, LinkDeviceService} from '../../services/linkdevice.service';

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

  protected stepState = 0

  protected pkmFiles: File[] = [];

  connect(): void {
    this.linkDeviceService.connectDevice()
      .then(isConnected => {
          this.linkDeviceConnected = isConnected
          if (isConnected) {
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

  upload()
  {
    this.pkmFiles.forEach(async(file: File) => {
      const blob = await file.bytes()
      await this.linkDeviceService.sendDataRaw(blob.slice(0, 49))
      await this.linkDeviceService.sendDataRaw(blob.slice(50, 100))
    })
  }

}
