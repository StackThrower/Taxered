/** Test-only: small broker and wallet files in the formats the agent reads. */

/** Interactive Brokers Flex Query: one AAPL lot sold in 2025 and a dividend. */
export const IB_XML = `<?xml version="1.0"?>
<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1" fromDate="20250101" toDate="20251231" period="Year">
<Trades>
<Trade tradeID="77" symbol="AAPL" assetCategory="STK" currency="USD" quantity="-10" tradePrice="200" proceeds="2000" ibCommission="-1" ibCommissionCurrency="USD" tradeDate="20250620" settleDateTarget="20250623" openCloseIndicator="C" />
<Lot tradeID="77" symbol="AAPL" isin="US0378331005" description="APPLE INC" assetCategory="STK" currency="USD" quantity="10" tradePrice="150" cost="1501" fifoPnlRealized="498" tradeDate="20250620" openDateTime="20250110;093000" openCloseIndicator="C" multiplier="1" />
</Trades>
<CashTransactions>
  <CashTransaction type="Dividends" symbol="AAPL" isin="US0378331005" amount="100" currency="USD" dateTime="20250315;202000" description="AAPL CASH DIVIDEND" />
</CashTransactions>
</FlexStatement></FlexStatements></FlexQueryResponse>`;

/** Ledger Live: 1 ETH received, then half of it swapped to USDC in one transaction. */
const LEDGER_HEADER =
  'Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash,Account Name,Account xpub,Countervalue Ticker,Countervalue at Operation Date,Countervalue at CSV Export';
const ledgerRow = (...f: string[]) => [...f.slice(0, 7), f[7], 'xpub', 'USD', f[8], f[8]].join(',');
export const LEDGER_CSV = [
  LEDGER_HEADER,
  ledgerRow(
    '2026-01-01T10:00:00.000Z',
    'Confirmed',
    'ETH',
    'IN',
    '1',
    '0',
    '0x1',
    'Ethereum 1',
    '3000',
  ),
  ledgerRow(
    '2026-02-01T10:00:00.000Z',
    'Confirmed',
    'ETH',
    'OUT',
    '0.5',
    '0.001',
    '0x2',
    'Ethereum 1',
    '1500',
  ),
  ledgerRow(
    '2026-02-01T10:00:00.000Z',
    'Confirmed',
    'USDC',
    'IN',
    '1450',
    '0.001',
    '0x2',
    'Ethereum 1',
    '1450',
  ),
].join('\n');

/** Interactive Brokers Activity Statement 2025: VTI bought and sold, a dividend. */
export const IB_CSV = [
  '﻿Statement,Header,Field Name,Field Value',
  'Statement,Data,Period,"January 1, 2025 - December 31, 2025"',
  'Account Information,Header,Field Name,Field Value',
  'Account Information,Data,Account,U1',
  'Change in NAV,Header,Field Name,Field Value',
  'Change in NAV,Data,Starting Value,10000',
  'Change in NAV,Data,Ending Value,11500',
  'Change in NAV,Data,Deposits & Withdrawals,500',
  'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code',
  'Trades,Data,Order,Stocks,USD,VTI,"2025-02-01, 10:00:00",10,100,100,-1000,-1,1001,0,0,O',
  'Trades,Data,Order,Stocks,USD,VTI,"2025-08-01, 10:00:00",-10,130,130,1300,-1,-1001,298,0,C',
  'Dividends,Header,Currency,Date,Description,Amount',
  'Dividends,Data,USD,2025-06-15,VTI Cash Dividend,20',
  'Dividends,Data,Total,,,20',
].join('\n');
