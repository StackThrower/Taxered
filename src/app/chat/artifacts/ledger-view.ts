import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LedgerPortfolio } from '../../widgets/ledger/ledger-portfolio';
import { ledgerFormatters } from '../../widgets/ledger/format';
import type { LedgerArtifact } from '../protocol';

/** Ledger Live portfolio with live prices, reusing the portfolio widget. */
@Component({
  selector: 'app-ledger-view',
  imports: [LedgerPortfolio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-3">
      <h3 class="text-lg font-semibold">Портфель Ledger: «{{ artifact().fileName }}»</h3>
      <app-ledger-portfolio
        [operations]="artifact().operations"
        [analysis]="artifact().analysis"
        [format]="format()"
      />
    </div>
  `,
})
export class LedgerView {
  readonly artifact = input.required<LedgerArtifact>();
  protected readonly format = computed(() =>
    ledgerFormatters(this.artifact().analysis.fiat || 'USD'),
  );
}
