import { Component, Input } from '@angular/core';
import {NgClass, NgIf} from '@angular/common';
import {ToastService, ToastType} from '../../services/toast.service';

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

  constructor(private toastService: ToastService) {
    this.toastService.toast$.subscribe(toast => {
      this.message = toast.text
      this.type = toast.type
      this.visible = true;

      setTimeout(() => {
        this.visible = false;
      }, toast.duration);
    })
  }
}
