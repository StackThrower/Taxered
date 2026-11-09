/**
 * Ledger portfolio sub-agent: balances, current value and value over time of a Ledger Live
 * wallet, from its CSV operation history and current market prices.
 */
import { tool } from '@langchain/core/tools';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { fetchMarketPrices, type MarketPrice } from '../../app/lib/crypto-prices';
import {
  currentHoldings,
  heldTickers,
  negativeBalances,
  portfolioHistory,
} from '../../app/lib/ledger-portfolio';
import { artifactId, emitArtifact, emitFile, errorText, result, sessionOf } from '../context';
import { isoDate, loadLedgerFile, type LedgerFile } from './ledger-file';

export const LEDGER_PROMPT = `You are the Ledger portfolio sub-agent of Taxered. From a Ledger Live operation history (CSV) you rebuild the wallet: balances of every asset, their current value at market prices (CoinGecko; Ledger's export prices as a fallback), the portfolio value over time against the money put in.

How to work:
- Call analyze_portfolio; never compute balances or values yourself.
- Balances start at zero, so the history must be complete; if the tool reports negative balances, explain that the file misses earlier operations.
- The chat shows the portfolio chart and the holdings table (with live prices) automatically; summarise the value, the gain against deposits and the largest holdings briefly.
- export_portfolio makes an Excel file with holdings and the value history.
- Questions about swap spreads and network fees belong to the spreads sub-agent; crypto taxation (Ф1, 18% + military levy) to the Ф1 sub-agent.
- Reply in the user's language (Ukrainian by default).`;

async function marketPrices(
  ledger: LedgerFile,
): Promise<{ prices: Map<string, MarketPrice>; warning?: string }> {
  try {
    return {
      prices: await fetchMarketPrices(
        heldTickers(ledger.operations),
        ledger.analysis.fiat || 'USD',
      ),
    };
  } catch (error) {
    return {
      prices: new Map(),
      warning: `Ринкові ціни недоступні (${errorText(error)}); використано ціни Ledger на момент експорту.`,
    };
  }
}

function portfolio(ledger: LedgerFile, prices: Map<string, MarketPrice>) {
  const { operations, analysis } = ledger;
  const holdings = currentHoldings(operations, prices);
  const history = portfolioHistory(operations, analysis.flows, analysis.swaps);
  return { holdings, history };
}

const analyzePortfolio = tool(
  async ({ fileId }, config) => {
    const session = sessionOf(config);
    const ledger = loadLedgerFile(session, fileId);
    const { prices, warning } = await marketPrices(ledger);
    const { holdings, history } = portfolio(ledger, prices);
    const value = holdings.reduce((sum, h) => sum + h.value, 0);
    const invested = history.at(-1)?.invested ?? 0;

    await emitArtifact(
      {
        kind: 'ledger',
        id: artifactId(),
        fileName: ledger.file.name,
        operations: ledger.operations,
        analysis: ledger.analysis,
      },
      config,
    );

    return result({
      file: ledger.file.name,
      note: ledger.note,
      fiat: ledger.analysis.fiat,
      period: { from: isoDate(ledger.analysis.from), to: isoDate(ledger.analysis.to) },
      currentValue: value,
      netDeposits: invested,
      gainVsDeposits: value - invested,
      networkFeesPaid: ledger.analysis.feeValue,
      holdings: holdings.slice(0, 15).map((h) => ({
        ticker: h.ticker,
        amount: h.amount,
        price: h.price,
        value: h.value,
        sharePct: value > 0 ? (h.value / value) * 100 : 0,
        change24hPct: h.change24h,
        priceSource: h.source,
      })),
      moreHoldings: Math.max(0, holdings.length - 15),
      incompleteHistory: negativeBalances(ledger.operations),
      warnings: warning ? [warning] : [],
    });
  },
  {
    name: 'analyze_portfolio',
    description:
      'Rebuild the Ledger wallet from an uploaded Ledger Live CSV: holdings at current prices and value over time; shows the portfolio chart and table in the chat.',
    schema: z.object({
      fileId: z.string().optional().describe('Ledger CSV id; the latest one if omitted.'),
    }),
  },
);

const exportPortfolio = tool(
  async ({ fileId }, config) => {
    const session = sessionOf(config);
    const ledger = loadLedgerFile(session, fileId);
    const { prices } = await marketPrices(ledger);
    const { holdings, history } = portfolio(ledger, prices);
    const fiat = ledger.analysis.fiat;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [
          'Актив',
          'Кількість',
          `Ціна, ${fiat}`,
          `Вартість, ${fiat}`,
          'Зміна за 24 год, %',
          'Джерело ціни',
        ],
        ...holdings.map((h) => [h.ticker, h.amount, h.price, h.value, h.change24h, h.source]),
      ]),
      'Активи',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Час', `Вартість, ${fiat}`, `Вкладено, ${fiat}`],
        ...history.map((p) => [
          new Date(p.time).toISOString().replace('T', ' ').slice(0, 19),
          p.value,
          p.invested,
        ]),
      ]),
      'Історія',
    );
    const bytes = new Uint8Array(
      XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer,
    );
    const name = `Taxered_portfel_ledger_${isoDate(ledger.analysis.to)}.xlsx`;
    await emitFile(
      config,
      name,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes,
      'Портфель Ledger: активи та історія вартості (Excel)',
    );
    return result({ file: name, holdings: holdings.length, points: history.length });
  },
  {
    name: 'export_portfolio',
    description: 'Excel file with the current holdings and the portfolio value history.',
    schema: z.object({ fileId: z.string().optional() }),
  },
);

export const ledgerTools = [analyzePortfolio, exportPortfolio];
