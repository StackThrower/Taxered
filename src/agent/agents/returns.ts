/**
 * Returns sub-agent: real (inflation-adjusted) return of an Interactive Brokers account by year,
 * from CSV Activity Statements, with the Ukrainian taxes on realized income.
 */
import { tool } from '@langchain/core/tools';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import type { ReturnsArtifact } from '../../app/chat/protocol';
import { importBrokerReport, parseBrokerReport } from '../../app/lib/broker-import';
import { inflationFor } from '../../app/lib/inflation';
import { fetchYearEndUSDRate } from '../../app/lib/nbu-exchange-rates';
import {
  analyzeReturns,
  startingCapital,
  statementYear,
  type FileIncome,
  type YearInput,
} from '../../app/lib/returns-model';
import {
  artifactId,
  emitArtifact,
  emitFile,
  errorText,
  pickFiles,
  result,
  sessionOf,
} from '../context';

export const RETURNS_PROMPT = `You are the investment-returns sub-agent of Taxered. From Interactive Brokers CSV Activity Statements you compute the year-by-year return of the account: realized trades and dividends at NBU rates, unrealized revaluation, Ukrainian taxes on realized income (PDFO + military levy), inflation, and the real return above inflation.

How to work:
- Call analyze_returns; never compute returns yourself. It reads every uploaded IB CSV statement (statements of earlier years supply the purchase dates of later sales, so more years give better results).
- Currency: USD by default (the account currency); UAH when the user thinks in hryvnias (adds the exchange-rate difference). Inflation defaults to US CPI for USD and Ukrainian CPI for UAH; the user may override deposits or inflation per year.
- "Taxes paid separately" means the user pays the tax from other money, not from the account.
- The chat shows the charts (return by year, capital vs inflation threshold) and the table automatically; summarise the main conclusions (average real return, years above/below inflation, tax drag) briefly.
- export_returns_table makes an Excel file when the user wants the numbers.
- Reply in the user's language (Ukrainian by default).`;

const yearOverride = z.object({ year: z.number().int(), value: z.number() });

const analyzeReturnsTool = tool(
  async (input, config) => {
    const session = sessionOf(config);
    const currency = input.currency ?? 'USD';
    const files = pickFiles(session, input.fileIds, ['ib_csv']);
    const warnings: string[] = [];

    const reports = files.flatMap((file) => {
      try {
        return [parseBrokerReport(file.name, file.content)];
      } catch (error) {
        warnings.push(`${file.name}: ${errorText(error)}`);
        return [];
      }
    });
    const history = reports.map((r) => r.statement);

    const incomes = new Map<number, FileIncome[]>();
    for (const report of reports) {
      const { start, end } = report.statement;
      const from = Number(start.slice(0, 4)) || Number(end.slice(0, 4));
      const to = Number(end.slice(0, 4)) || from;
      if (!from) {
        warnings.push(`${report.name}: не вдалося визначити період виписки.`);
        continue;
      }
      for (let year = from; year <= to; year++) {
        try {
          const income = await importBrokerReport(report, year, () => undefined, history);
          warnings.push(...income.warnings.map((w) => `${report.name} (${year}): ${w}`));
          incomes.set(year, [...(incomes.get(year) ?? []), income]);
        } catch (error) {
          warnings.push(`${report.name} (${year}): ${errorText(error)}`);
        }
      }
    }
    if (incomes.size === 0) {
      throw new Error(`Не вдалося прочитати жодної виписки. ${warnings.join(' ')}`);
    }

    const years = [...incomes.keys()].sort((a, b) => a - b);
    const first = years[0];
    const last = years[years.length - 1];
    const usdRates: Record<number, number | null> = {};
    await Promise.all(
      Array.from({ length: last - first + 2 }, (_, i) => first - 1 + i).map(async (year) => {
        usdRates[year] = await fetchYearEndUSDRate(year);
      }),
    );
    const fromUsd = (usd: number, rateYear: number) =>
      currency === 'UAH' ? usd * (usdRates[rateYear] ?? 0) : usd;

    const all = [...incomes.values()].flat();
    const deposits = new Map(input.deposits?.map((d) => [d.year, d.value]));
    const inflation = new Map(input.inflation?.map((d) => [d.year, d.value]));
    const yearInputs: YearInput[] = years.map((year) => {
      const statement = statementYear(all, year);
      return {
        year,
        files: incomes.get(year) ?? [],
        deposits: deposits.get(year) ?? (statement ? fromUsd(statement.deposits, year - 1) : 0),
        inflation: inflation.get(year) ?? inflationFor(currency, year),
        accountGainUsd: statement?.gain ?? null,
      };
    });
    const start = startingCapital(all, first);
    const initialCapital = Math.max(
      0,
      input.initialCapital ?? (start ? fromUsd(start.value, first - 1) : 0),
    );
    const options = {
      currency,
      initialCapital,
      includeTaxes: input.includeTaxes ?? true,
      taxesPaidSeparately: input.taxesPaidSeparately ?? false,
      usdRates,
    } as const;
    const analysis = analyzeReturns(yearInputs, options);
    session.returns = { currency, analysis };

    const artifact: ReturnsArtifact = {
      kind: 'returns',
      id: artifactId(),
      years: yearInputs,
      ...options,
      usdRates: { ...usdRates },
    };
    await emitArtifact(artifact, config);

    return result({
      currency,
      initialCapital,
      years: analysis.rows.map((r) => ({
        year: r.year,
        missingStatement: r.missing,
        trades: r.trades,
        dividends: r.dividends,
        unrealized: r.unrealized,
        fx: r.fx,
        tax: r.tax,
        net: r.net,
        deposits: r.deposits,
        endCapital: r.endCapital,
        inflationThreshold: r.threshold,
        inflationPct: r.inflation,
        returnPct: r.returnPct,
        realReturnPct: r.realReturnPct,
      })),
      totals: {
        realizedGross: analysis.gross,
        unrealized: analysis.unrealized,
        fx: analysis.fx,
        tax: analysis.tax,
        net: analysis.net,
        finalCapital: analysis.finalCapital,
        finalThreshold: analysis.finalThreshold,
        realGain: analysis.realGain,
        realGainInStartPrices: analysis.realGainInStartPrices,
        avgRealReturnPct: analysis.avgRealReturnPct,
      },
      warnings,
    });
  },
  {
    name: 'analyze_returns',
    description:
      'Analyse the uploaded IB CSV Activity Statements: yearly nominal and real return, taxes, inflation threshold and capital. Shows the charts and table in the chat.',
    schema: z.object({
      fileIds: z.array(z.string()).optional().describe('Default: all IB CSV statements.'),
      currency: z.enum(['USD', 'UAH']).optional(),
      includeTaxes: z.boolean().optional(),
      taxesPaidSeparately: z.boolean().optional(),
      initialCapital: z
        .number()
        .nonnegative()
        .optional()
        .describe('Override of the starting capital in the chosen currency.'),
      deposits: z
        .array(yearOverride)
        .optional()
        .describe('Net deposits per year in the chosen currency (overrides the statements).'),
      inflation: z.array(yearOverride).optional().describe('Inflation per year, percent.'),
    }),
  },
);

const exportReturnsTable = tool(
  async (_input, config) => {
    const session = sessionOf(config);
    if (!session.returns) {
      throw new Error('Спочатку виконайте analyze_returns.');
    }
    const { currency, analysis } = session.returns;
    const header = [
      'Рік',
      `Угоди, ${currency}`,
      `Дивіденди, ${currency}`,
      `Переоцінка, ${currency}`,
      `Курсова різниця, ${currency}`,
      `Податки, ${currency}`,
      `Чистий дохід, ${currency}`,
      `Поповнення, ${currency}`,
      `Капітал на кінець, ${currency}`,
      `Поріг інфляції, ${currency}`,
      'Інфляція, %',
      'Дохідність, %',
      'Реальна дохідність, %',
    ];
    const rows = analysis.rows.map((r) => [
      r.year,
      r.trades,
      r.dividends,
      r.unrealized,
      r.fx,
      r.tax,
      r.net,
      r.deposits,
      r.endCapital,
      r.threshold,
      r.inflation,
      r.returnPct,
      r.realReturnPct,
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'Дохідність');
    const bytes = new Uint8Array(
      XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer,
    );
    const name = `Taxered_dokhidnist_${analysis.rows[0]?.year ?? ''}-${analysis.rows.at(-1)?.year ?? ''}.xlsx`;
    await emitFile(
      config,
      name,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes,
      'Дохідність за роками (Excel)',
    );
    return result({ file: name });
  },
  {
    name: 'export_returns_table',
    description: 'Excel file with the year-by-year returns of the last analysis.',
    schema: z.object({}),
  },
);

export const returnsTools = [analyzeReturnsTool, exportReturnsTable];
