import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar.component';
import {NgOptimizedImage} from '@angular/common';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

const THEME_KEY = 'celio-theme';
const THEME_LIGHT = 'emerald';
const THEME_DARK = 'emerald-dark';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, NgOptimizedImage],
  templateUrl: './layout.component.html'
})
export class LayoutComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected menuOpen = false;
  protected isDark = document.documentElement.getAttribute('data-theme') === THEME_DARK;

  ngOnInit(): void {
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      this.menuOpen = false;
    });
  }

  protected toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  protected closeMenu(): void {
    this.menuOpen = false;
  }

  protected toggleTheme(): void {
    this.isDark = !this.isDark;
    const theme = this.isDark ? THEME_DARK : THEME_LIGHT;
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
    }
  }
}
