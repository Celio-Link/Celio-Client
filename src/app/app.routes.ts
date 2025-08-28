import { Routes } from '@angular/router';
import { LayoutComponent } from '../layout/layout.component';
import { OnlineLinkComponent } from '../pages/onlineLink/onlineLink.component';
import { TradeEmuComponent } from '../pages/tradeEmu/tradeEmu.component';
import { ContactComponent } from '../pages/contact/contact.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent, // persistent sidebar
    children: [
      { path: '', redirectTo: 'onlineLink', pathMatch: 'full' },
      { path: 'onlineLink', component: OnlineLinkComponent },
      { path: 'tradeEmu', component: TradeEmuComponent },
      { path: 'contact', component: ContactComponent }
    ]
  }
];
