import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type ToastType = 'warning' | 'error' | 'info';

export interface ToastMessage {
  text: string;
  type: ToastType;
  duration: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastSubject = new Subject<ToastMessage>();

  toast$ = this.toastSubject.asObservable();

  show(text: string, type: ToastMessage['type'] = 'warning', duration = 3000) {
    this.toastSubject.next({ text, type, duration });
  }
}
