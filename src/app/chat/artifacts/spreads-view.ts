import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { Info } from 'lucide';
import { UK } from '../../core/i18n';
import { spreadsByPair, type Swap } from '../../lib/ledger-csv';
import { Icon } from '../../shared/icon';
import { ledgerFormatters } from '../../widgets/ledger/format';
import type { SpreadsArtifact } from '../protocol';

/** Swap spreads and network fees of a Ledger Live history. */
@Component({
  selector: 'app-spreads-view',
  imports: [Icon],
  templateUrl: './spreads-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpreadsView {
  readonly artifact = input.required<SpreadsArtifact>();

  protected readonly s = UK.ledger;
  protected readonly icons = { Info };

  /** Starts as the agent counted; the user can switch linked swaps on and off. */
  protected readonly includeLinked = linkedSignal(() => this.artifact().includeLinked);

  protected readonly swaps = computed<Swap[]>(() => {
    const swaps = this.artifact().analysis.swaps;
    return this.includeLinked() ? swaps : swaps.filter((swap) => swap.kind === 'tx');
  });
  protected readonly linkedCount = computed(
    () => this.artifact().analysis.swaps.filter((swap) => swap.kind === 'linked').length,
  );
  protected readonly pairs = computed(() => spreadsByPair(this.swaps()));
  protected readonly totals = computed(() => {
    const swaps = this.swaps();
    const given = swaps.reduce((sum, swap) => sum + swap.givenValue, 0);
    const received = swaps.reduce((sum, swap) => sum + swap.receivedValue, 0);
    const spread = given - received;
    return {
      given,
      received,
      spread,
      spreadPercent: given > 0 ? (spread / given) * 100 : 0,
      fee: swaps.reduce((sum, swap) => sum + swap.fee, 0),
    };
  });
  protected readonly feeTransactions = computed(() =>
    this.artifact().analysis.fees.reduce((sum, fee) => sum + fee.transactions, 0),
  );
  protected readonly formatters = computed(() =>
    ledgerFormatters(this.artifact().analysis.fiat || 'USD'),
  );
  protected readonly methodNotes = computed(() => {
    const fiat = this.artifact().analysis.fiat || 'USD';
    return this.s.method.map((note) => note.replace('{fiat}', fiat));
  });
}
