import { Component, Input } from '@angular/core';
import {NgClass, NgIf} from '@angular/common';

export type ToastType = 'warning' | 'error';

@Component({
  selector: 'app-toast',
  imports: [
    NgIf,
    NgClass
  ],
  templateUrl: './toast.component.html'
})
export class ToastComponent {
  @Input() message = '';
  visible = false;
  type: ToastType = 'warning';

  show(message: string, type: ToastType = 'warning', duration = 3000) {
    this.message = message;
    this.type = type;
    this.visible = true;

    setTimeout(() => {
      this.visible = false;
    }, duration);
  }
}
