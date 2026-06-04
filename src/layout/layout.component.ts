import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar.component';
import {NgOptimizedImage} from '@angular/common';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, NgOptimizedImage],
  templateUrl: './layout.component.html'
})
export class LayoutComponent {}
