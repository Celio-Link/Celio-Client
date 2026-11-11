import {Component, inject, Input, Output, EventEmitter} from '@angular/core';
import {LinkDeviceService} from '../../../services/linkdevice.service';
import {NgClass, NgIf} from '@angular/common';
import {ToastComponent} from '../../toast/toast.component';
import {firmwareAtLeast, LinkDeviceUtils, MIN_FIRMWARE} from '../../../shared/linkDeviceUtils';

@Component({
  selector: 'celio-connection-panel',
  imports: [
    NgIf
  ],
  templateUrl: './connect.component.html'
})
export class CelioConnectionStatusComponent {

  @Input() active = false;
  /** Offer the emulator in the page as the device. */
  @Input() offerEmulator = false;
  @Output() next = new EventEmitter<void>();
  @Output() useEmulator = new EventEmitter<void>();

  private linkDeviceService = inject(LinkDeviceService)

  protected readonly usbSupported: boolean =
    typeof navigator !== 'undefined' && navigator.usb !== undefined;
  protected readonly serialSupported: boolean =
    typeof navigator !== 'undefined' && navigator.serial !== undefined;

  protected get webUsbError(): boolean {
    return !this.usbSupported && !this.serialSupported;
  }

  // Prefer WebUSB; fall back to WebSerial only when WebUSB is unavailable
  // (e.g. Firefox 151+, or Chromium with WebUSB disabled).
  connectTransport(): 'usb' | 'serial' | null {
    return this.usbSupported ? 'usb' : (this.serialSupported ? 'serial' : null);
  }

  connectLabel(): string {
    return this.connectTransport() === 'serial' ? 'Connect via Serial' : 'Connect via USB';
  }

  /** Why the adapter that was just chosen can't be used, for the player to act on. */
  protected firmwareError: string | null = null;

  connect(): void {
    const kind = this.connectTransport();
    if (!kind) return;

    this.firmwareError = null;
    this.linkDeviceService.connectDevice(kind)
      .then(async isConnected => {
          if (!isConnected) return;
          const version = await LinkDeviceUtils.getFirmwareVersion(this.linkDeviceService)
            ?? await LinkDeviceUtils.getFirmwareVersion(this.linkDeviceService);
          if (version && firmwareAtLeast(version, MIN_FIRMWARE)) {
            this.next.emit();
            return;
          }
          const min = `v${MIN_FIRMWARE.major}.${MIN_FIRMWARE.minor}.${MIN_FIRMWARE.patch}`;
          const have = version ? `firmware v${version.major}.${version.minor}.${version.patch}` : 'an older firmware';
          this.firmwareError = `This adapter runs ${have}. Update it to ${min} or newer from the GBLink launcher, then connect again.`;
          await this.linkDeviceService.disconnect();
        }
      )
  }
}
