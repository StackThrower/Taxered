import { ChangeDetectionStrategy, Component, ElementRef, signal, viewChild } from '@angular/core';
import { AlertCircle, CheckCircle, FileText } from 'lucide';
import { UK } from '../core/i18n';
import { Icon } from '../shared/icon';
import { FormF0121214 } from './f0121214/form-f0121214';
import { UA_COUNTRY, UA_TAX_FORMS } from './tax-forms';

const IMPLEMENTED_FORMS = new Set(['f0121214']);

@Component({
  selector: 'app-forms-section',
  imports: [Icon, FormF0121214],
  templateUrl: './forms-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormsSection {
  protected readonly s = UK.forms;
  protected readonly country = UA_COUNTRY;
  protected readonly forms = UA_TAX_FORMS;
  protected readonly tabForms = UA_TAX_FORMS.slice(0, 3);
  protected readonly implemented = IMPLEMENTED_FORMS;
  protected readonly icons = { AlertCircle, CheckCircle, FileText };

  protected readonly activeTab = signal(UA_TAX_FORMS[0]?.id ?? 'f0121214');

  private readonly tabs = viewChild<ElementRef<HTMLElement>>('tabs');

  protected selectForm(formId: string): void {
    this.activeTab.set(formId);
    this.tabs()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Arrow-key navigation between tabs (WAI-ARIA tabs pattern). */
  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!offset) {
      return;
    }
    event.preventDefault();
    const next = this.tabForms[(index + offset + this.tabForms.length) % this.tabForms.length];
    this.activeTab.set(next.id);
    this.tabs()?.nativeElement.querySelector<HTMLElement>(`#tab-${next.id}`)?.focus();
  }
}
