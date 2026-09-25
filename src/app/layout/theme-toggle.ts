import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Moon, Sun } from 'lucide';
import { UK } from '../core/i18n';
import { ThemeService } from '../core/theme.service';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-theme-toggle',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="btn btn-ghost btn-icon"
      [attr.aria-label]="label()"
      (click)="theme.toggle()"
    >
      <!-- Both icons are rendered and swapped with CSS so server and client markup match. -->
      <svg [appIcon]="Sun" class="size-5 dark:hidden"></svg>
      <svg [appIcon]="Moon" class="hidden size-5 dark:block"></svg>
    </button>
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
  protected readonly Sun = Sun;
  protected readonly Moon = Moon;

  protected readonly label = computed(() =>
    this.theme.resolved() === 'dark' ? UK.theme.toLight : UK.theme.toDark,
  );
}
