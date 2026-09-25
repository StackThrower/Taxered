import { ChangeDetectionStrategy, Component, ElementRef, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Calculator, FileText, Heart, HelpCircle, Menu, X } from 'lucide';
import { UK } from '../core/i18n';
import { DONATE_URL, localePath } from '../core/site';
import { Icon } from '../shared/icon';
import { ThemeToggle } from './theme-toggle';

@Component({
  selector: 'app-header',
  imports: [RouterLink, Icon, ThemeToggle],
  templateUrl: './header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  protected readonly s = UK.header;
  protected readonly donateUrl = DONATE_URL;
  protected readonly homePath = localePath();
  protected readonly calculatorPath = localePath('calculator');
  protected readonly helpPath = localePath('help');
  protected readonly icons = { Calculator, FileText, Heart, HelpCircle, Menu, X };

  private readonly menu = viewChild.required<ElementRef<HTMLDialogElement>>('menu');

  protected openMenu(): void {
    this.menu().nativeElement.showModal();
  }

  protected closeMenu(): void {
    this.menu().nativeElement.close();
  }

  /** Close when the backdrop (the dialog element itself, outside the panel) is clicked. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.menu().nativeElement) {
      this.closeMenu();
    }
  }
}
