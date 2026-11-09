import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AlertCircle, FilePen, X } from 'lucide';
import {
  calculateTaxes,
  calculationNotes,
  militaryTaxRateLabel,
} from '../../declaration/f0121214/tax-model';
import { FormF0121214, type F1Seed } from '../../declaration/f0121214/form-f0121214';
import { toHryvnias } from '../../lib/dps-xml/money';
import { Icon } from '../../shared/icon';
import { BarChart } from '../../widgets/charts/bar-chart';
import type { ChartSeries } from '../../widgets/charts/chart-utils';
import { ChatService } from '../chat.service';
import type { F1Artifact } from '../protocol';

const uah = new Intl.NumberFormat('uk-UA', {
  style: 'currency',
  currency: 'UAH',
  maximumFractionDigits: 2,
});
const compact = new Intl.NumberFormat('uk-UA', {
  style: 'currency',
  currency: 'UAH',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Annex Ф1 as the agent calculated it, recomputed here from its positions. */
@Component({
  selector: 'app-f1-view',
  imports: [BarChart, FormF0121214, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = calc();
    @let f1 = c.f1;
    <section class="card" [attr.aria-labelledby]="'f1-title-' + artifact().id">
      <div class="card-header">
        <h3 class="card-title" [id]="'f1-title-' + artifact().id">
          Додаток Ф1 (F0121215) за {{ artifact().year }} рік
        </h3>
        <p class="card-description">
          {{ f1.rows.length }} операцій у Ф1 · ПДФО 18% (дивіденди 9%) · військовий збір
          {{ militaryRate() }}%
        </p>
      </div>
      <div class="card-content space-y-6">
        <dl class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div class="rounded-lg border p-3">
            <dt class="text-xs text-muted-foreground">Фінансовий результат (р. 3)</dt>
            <dd class="text-lg font-semibold tabular-nums">{{ money(hr(f1.financialResult)) }}</dd>
          </div>
          <div class="rounded-lg border p-3">
            <dt class="text-xs text-muted-foreground">ПДФО до сплати</dt>
            <dd class="text-lg font-semibold tabular-nums">{{ money(c.pdfo) }}</dd>
          </div>
          <div class="rounded-lg border p-3">
            <dt class="text-xs text-muted-foreground">Військовий збір</dt>
            <dd class="text-lg font-semibold tabular-nums">{{ money(c.militaryTax) }}</dd>
          </div>
          <div class="rounded-lg border border-primary p-3">
            <dt class="text-xs text-muted-foreground">Разом податків</dt>
            <dd class="text-lg font-bold tabular-nums">{{ money(c.total) }}</dd>
          </div>
        </dl>

        @if (f1.belowThreshold) {
          <div class="alert" role="note">
            <svg [appIcon]="icons.AlertCircle" class="size-4"></svg>
            <p>
              Дохід від продажу не перевищує поріг пп. «а» 170.2.8 ПКУ — Ф1 не подається, податок з
              операцій не нараховується.
            </p>
          </div>
        }

        @if (c.total > 0) {
          <div>
            <h4 class="mb-2 text-sm font-semibold">Структура податків</h4>
            <app-bar-chart
              [categories]="taxChart.categories"
              [series]="taxChart.series()"
              label="Структура податків: ПДФО і військовий збір за видами доходу"
              [format]="money"
              [axisFormat]="compactMoney"
            />
          </div>
        }

        <div
          class="overflow-x-auto rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          tabindex="0"
          role="region"
          [attr.aria-label]="'Рядки Ф1 за ' + artifact().year"
        >
          <table class="w-full text-sm tabular-nums">
            <caption class="sr-only">
              Підсумкові рядки додатка Ф1
            </caption>
            <thead>
              <tr class="border-b text-left text-muted-foreground">
                <th scope="col" class="py-2 pr-4 font-medium">Рядок</th>
                <th scope="col" class="py-2 pr-4 font-medium">Показник</th>
                <th scope="col" class="py-2 text-right font-medium">Сума</th>
              </tr>
            </thead>
            <tbody>
              @for (row of summaryRows(); track row.code) {
                <tr class="border-b last:border-0">
                  <th scope="row" class="py-1.5 pr-4 text-left font-medium">{{ row.code }}</th>
                  <td class="py-1.5 pr-4">{{ row.label }}</td>
                  <td class="py-1.5 text-right">{{ money(row.value) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (f1.rows.length > 0) {
          <details class="rounded-lg border p-3">
            <summary class="cursor-pointer text-sm font-semibold">
              Операції Ф1 ({{ f1.rows.length }})
            </summary>
            <div
              class="mt-3 max-h-96 overflow-auto rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              tabindex="0"
              role="region"
              aria-label="Операції Ф1"
            >
              <table class="w-full text-sm tabular-nums">
                <thead class="sticky top-0 bg-card">
                  <tr class="border-b text-left text-muted-foreground">
                    <th scope="col" class="py-2 pr-3 font-medium">Код</th>
                    <th scope="col" class="py-2 pr-3 font-medium">Опис</th>
                    <th scope="col" class="py-2 pr-3 text-right font-medium">Дохід</th>
                    <th scope="col" class="py-2 pr-3 text-right font-medium">Витрати</th>
                    <th scope="col" class="py-2 text-right font-medium">Результат</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of f1.rows; track $index) {
                    <tr class="border-b last:border-0">
                      <td class="py-1.5 pr-3">{{ row.code }}</td>
                      <td class="py-1.5 pr-3">{{ row.description }}</td>
                      <td class="py-1.5 pr-3 text-right">{{ money(hr(row.income)) }}</td>
                      <td class="py-1.5 pr-3 text-right">{{ money(hr(row.costs)) }}</td>
                      <td
                        class="py-1.5 text-right font-medium"
                        [class.text-destructive]="row.result < 0"
                      >
                        {{ money(hr(row.result)) }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </details>
        }

        @if (notes().length > 0) {
          <ul class="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            @for (note of notes(); track note) {
              <li>{{ note }}</li>
            }
          </ul>
        }

        <div>
          <button
            type="button"
            class="btn btn-outline btn-sm"
            (click)="toggleForm()"
            [attr.aria-expanded]="editing()"
          >
            <svg [appIcon]="editing() ? icons.X : icons.FilePen" class="size-4"></svg>
            {{ editing() ? 'Закрити форму' : 'Відкрити в редагованій формі Ф1' }}
          </button>
        </div>
      </div>
    </section>

    @if (editing()) {
      @defer {
        <div class="mt-4">
          <app-form-f0121214 [seed]="seed()" />
        </div>
      } @placeholder {
        <p class="mt-4 text-sm text-muted-foreground">Завантаження форми…</p>
      }
    }
  `,
})
export class F1View {
  readonly artifact = input.required<F1Artifact>();

  private readonly chat = inject(ChatService);
  protected readonly icons = { AlertCircle, FilePen, X };
  protected readonly money = (value: number) => uah.format(value);
  protected readonly compactMoney = (value: number) => compact.format(value);
  protected readonly hr = toHryvnias;

  protected readonly calc = computed(() => {
    const { positions, year, options } = this.artifact();
    return calculateTaxes(positions, year, options);
  });
  protected readonly militaryRate = computed(() => militaryTaxRateLabel(this.artifact().year));
  protected readonly notes = computed(() =>
    calculationNotes(this.calc(), this.artifact().positions),
  );
  protected readonly editing = computed(() => this.chat.editingF1() === this.artifact().id);
  protected readonly seed = computed<F1Seed>(() => {
    const { year, positions, options } = this.artifact();
    return { year, positions, options };
  });

  protected readonly taxChart = {
    categories: ['Інвестиційний прибуток (Ф1)', 'Іноземні дивіденди й відсотки'],
    series: computed<ChartSeries[]>(() => {
      const c = this.calc();
      return [
        { label: 'ПДФО', color: 'var(--chart-1)', values: [c.pdfoFromTrades, c.pdfoFromDividends] },
        {
          label: 'Військовий збір',
          color: 'var(--chart-2)',
          values: [c.militaryTaxFromTrades, c.militaryTaxFromDividends],
        },
      ];
    }),
  };

  protected readonly summaryRows = computed(() => {
    const f1 = this.calc().f1;
    const h = toHryvnias;
    return [
      { code: '1 (гр. 4)', label: 'Сума доходу від операцій', value: h(f1.totalIncome) },
      { code: '1 (гр. 5)', label: 'Витрати на придбання', value: h(f1.totalCosts) },
      { code: '1 (гр. 6)', label: 'Фінансовий результат операцій', value: h(f1.totalResult) },
      { code: '2', label: 'Від’ємний результат попередніх років', value: h(f1.previousYearsLoss) },
      { code: '3', label: 'Загальний фінансовий результат', value: h(f1.financialResult) },
      { code: '3.1', label: 'Інвестиційний прибуток', value: h(f1.profit) },
      { code: '3.2', label: 'Збиток на наступний рік', value: h(f1.loss) },
      { code: '4', label: 'ПДФО', value: h(f1.pdfo) },
      { code: '4.1', label: 'ПДФО, утриманий агентом', value: h(f1.pdfoWithheld) },
      { code: '4.2', label: 'ПДФО до сплати', value: h(f1.pdfoPayable) },
      { code: '5', label: 'Військовий збір', value: h(f1.militaryLevy) },
      {
        code: '5.1',
        label: 'Військовий збір, утриманий агентом',
        value: h(f1.militaryLevyWithheld),
      },
      { code: '5.2', label: 'Військовий збір до сплати', value: h(f1.militaryLevyPayable) },
    ];
  });

  protected toggleForm(): void {
    this.chat.editingF1.set(this.editing() ? null : this.artifact().id);
  }
}
