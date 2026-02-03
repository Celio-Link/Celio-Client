import { Routes } from '@angular/router';
import { LayoutComponent } from '../layout/layout.component';
import { OnlineLinkComponent } from '../pages/onlineLink/onlineLink.component';
import { TradeEmuComponent } from '../pages/tradeEmu/tradeEmu.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent, // persistent sidebar
    children: [
      { path: '', redirectTo: 'onlineLink', pathMatch: 'full' },
      { path: 'onlineLink', component: OnlineLinkComponent },
      { path: 'tradeEmu', component: TradeEmuComponent }
    ]
  }
];
