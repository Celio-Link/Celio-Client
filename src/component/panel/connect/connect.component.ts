import {Component, inject, Input, Output, EventEmitter} from '@angular/core';
import {LinkDeviceService} from '../../../services/linkdevice.service';
import {NgClass, NgIf} from '@angular/common';
import {ToastComponent} from '../../toast/toast.component';

@Component({
  selector: 'celio-connection-panel',
  imports: [
    NgIf
  ],
  templateUrl: './connect.component.html'
})
export class CelioConnectionStatusComponent {

  @Input() active = false;
  @Output() next = new EventEmitter<void>();

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

  connect(): void {
    const kind = this.connectTransport();
    if (!kind) return;

    this.linkDeviceService.connectDevice(kind)
      .then(async isConnected => {
          if (isConnected) {
            this.next.emit();
          }
        }
      )
  }
}
