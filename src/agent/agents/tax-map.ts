/**
 * Tax-map sub-agent: headline tax rates on investment income (dividends, capital gains,
 * interest) of individual residents in 60+ countries, from `tax-data.ts`.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  COUNTRIES,
  DATA_UPDATED,
  METRICS,
  REGIONS,
  type CountryTax,
  type Metric,
} from '../../app/lib/tax-data';
import { artifactId, emitArtifact, result } from '../context';

export const TAX_MAP_PROMPT = `You are the tax-map sub-agent of Taxered. You know the headline tax rates on investment income — dividends, capital gains and interest — for individual tax residents of ${COUNTRIES.length} countries (Europe, Asia, Americas), as of ${DATA_UPDATED}. Rates are simplified: foreign-source income through a broker such as IBKR, no treaty relief, allowances or thresholds; special regimes for newcomers are described separately.

How to work:
- Look the rates up with the tools; never quote a rate from memory. If a country is not in the data, say so.
- show_tax_map draws the interactive world map in the chat (choose the metric and region, highlight the countries discussed). Use it whenever the user compares countries or asks "where".
- compare_net_income shows how much of an amount of income is left after tax in each country, with a chart.
- Mention opt-in regimes (non-dom, flat tax, tax holidays) when they matter, and that this is an overview, not advice for a specific case.
- Reply in the user's language (Ukrainian by default).`;

const metricSchema = z
  .enum(METRICS as unknown as [Metric, ...Metric[]])
  .describe('dividends, capitalGains or interest');
const regionSchema = z.enum(REGIONS as unknown as ['europe', 'asia', 'americas']);

const METRIC_LABELS: Record<Metric, string> = {
  dividends: 'дивіденди',
  capitalGains: 'приріст капіталу',
  interest: 'відсотки',
};

/** Finds countries by ISO code or by (part of) the Ukrainian name. */
export function findCountries(queries: readonly string[]): {
  found: CountryTax[];
  missing: string[];
} {
  const found: CountryTax[] = [];
  const missing: string[] = [];
  for (const query of queries) {
    const q = query.trim().toLowerCase();
    const country =
      COUNTRIES.find((c) => c.code.toLowerCase() === q) ??
      COUNTRIES.find((c) => c.name.toLowerCase() === q) ??
      COUNTRIES.find((c) => c.name.toLowerCase().startsWith(q));
    if (country) {
      if (!found.includes(country)) {
        found.push(country);
      }
    } else {
      missing.push(query);
    }
  }
  return { found, missing };
}

function describe(c: CountryTax) {
  return {
    code: c.code,
    name: c.name,
    region: c.region,
    rates: c.rates,
    regime: c.regime,
    notes: c.notes,
  };
}

const getRates = tool(
  async ({ countries, region }) => {
    if (countries && countries.length > 0) {
      const { found, missing } = findCountries(countries);
      return result({ countries: found.map(describe), notInData: missing, dataAsOf: DATA_UPDATED });
    }
    const list = region ? COUNTRIES.filter((c) => c.region === region) : COUNTRIES;
    return result({
      countries: list.map((c) => ({ code: c.code, name: c.name, rates: c.rates })),
      dataAsOf: DATA_UPDATED,
    });
  },
  {
    name: 'get_country_tax_rates',
    description:
      'Tax rates (percent) on dividends, capital gains and interest with regimes and notes, for the given countries (ISO alpha-2 codes or Ukrainian names) or a whole region.',
    schema: z.object({
      countries: z.array(z.string()).optional(),
      region: regionSchema.optional(),
    }),
  },
);

const rankCountries = tool(
  async ({ metric, region, order, limit }) => {
    const list = (region ? COUNTRIES.filter((c) => c.region === region) : [...COUNTRIES]).sort(
      (a, b) =>
        (order === 'desc' ? -1 : 1) * (a.rates[metric] - b.rates[metric]) ||
        a.name.localeCompare(b.name, 'uk'),
    );
    return result({
      metric,
      countries: list.slice(0, limit ?? 10).map((c) => ({
        code: c.code,
        name: c.name,
        rate: c.rates[metric],
        regime: c.regime,
      })),
    });
  },
  {
    name: 'rank_countries',
    description:
      'Countries ordered by the tax rate on one kind of income (lowest first by default).',
    schema: z.object({
      metric: metricSchema,
      region: regionSchema.optional(),
      order: z.enum(['asc', 'desc']).optional(),
      limit: z.number().int().min(1).max(70).optional(),
    }),
  },
);

const showTaxMap = tool(
  async ({ metric, region, highlight, selected }, config) => {
    const codes = highlight ? findCountries(highlight).found.map((c) => c.code) : [];
    const open = selected ? (findCountries([selected]).found[0]?.code ?? null) : null;
    await emitArtifact(
      {
        kind: 'tax-map',
        id: artifactId(),
        metric,
        view: region ?? 'world',
        selected: open,
        highlight: codes,
      },
      config,
    );
    return result({
      shown: true,
      metric: METRIC_LABELS[metric],
      highlighted: codes,
      selected: open,
    });
  },
  {
    name: 'show_tax_map',
    description:
      'Show the interactive world map of tax rates in the chat, optionally zoomed to a region, with a table of highlighted countries and one country card open.',
    schema: z.object({
      metric: metricSchema,
      region: regionSchema.optional(),
      highlight: z.array(z.string()).optional().describe('Countries for the table under the map.'),
      selected: z.string().optional().describe('Country whose card is open.'),
    }),
  },
);

const compareNetIncome = tool(
  async ({ amount, currency, metric, countries }, config) => {
    const { found, missing } = findCountries(countries);
    if (found.length === 0) {
      throw new Error(`Немає даних для: ${missing.join(', ')}.`);
    }
    const rows = found
      .map((c) => {
        const tax = (amount * c.rates[metric]) / 100;
        return { code: c.code, name: c.name, rate: c.rates[metric], tax, net: amount - tax };
      })
      .sort((a, b) => b.net - a.net);
    await emitArtifact(
      {
        kind: 'chart',
        id: artifactId(),
        title: `Що лишиться з ${amount.toLocaleString('uk-UA')} ${currency} (${METRIC_LABELS[metric]})`,
        chart: 'bar',
        categories: rows.map((r) => r.name),
        series: [
          { label: 'Після податку', values: rows.map((r) => r.net) },
          { label: 'Податок', values: rows.map((r) => r.tax) },
        ],
        unit: 'money',
        currency,
      },
      config,
    );
    return result({ metric, amount, currency, rows, notInData: missing });
  },
  {
    name: 'compare_net_income',
    description:
      'Net income left after the headline tax in each country for a given amount of one kind of income; shows a bar chart in the chat.',
    schema: z.object({
      amount: z.number().positive(),
      currency: z.string().length(3),
      metric: metricSchema,
      countries: z.array(z.string()).min(1).max(15),
    }),
  },
);

export const taxMapTools = [getRates, rankCountries, showTaxMap, compareNetIncome];
