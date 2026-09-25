/**
 * Interactive Brokers XML Parser
 * Parses FlexQuery XML files and extracts trade data for tax forms
 */

export type BrokerSource = 'interactive_brokers' | 'freedom_finance' | 'manual';

export interface IBTrade {
  symbol: string;
  description: string;
  quantity: number;
  tradePrice: number;
  tradeDate: string;
  openDateTime: string;
  reportDate: string;
  currency: string;
  cost: number;
  fifoPnlRealized: number;
  assetCategory: string;
  subCategory: string;
  multiplier: number;
  source?: BrokerSource;
  sourceFile?: string;
}

export interface IBDividend {
  symbol: string;
  description: string;
  amount: number;
  date: string;
  currency: string;
  assetCategory: string;
  subCategory: string;
  source?: BrokerSource;
  sourceFile?: string;
}

export interface ParsedIBData {
  trades: IBTrade[];
  dividends: IBDividend[];
  accountId: string;
  fromDate: string;
  toDate: string;
  period: string;
  source: BrokerSource;
}

// Freedom Finance types
export interface FFTrade {
  tradeId: string;
  date: string;
  shortDate: string;
  payDate: string;
  symbol: string;
  instrType: string;
  instrKind: string;
  isin: string;
  operation: 'buy' | 'sell';
  price: number;
  currency: string;
  quantity: number;
  sum: number;
  profit: number;
  commission: number;
  commissionCurrency: string;
}

// Freedom Finance dividend types
export interface FFDividend {
  date: string; // Payment date
  symbol: string; // Ticker symbol (e.g., VTI.US)
  description: string; // Full description
  isin: string; // ISIN code
  grossAmount: number; // Gross dividend amount
  taxAmount: number; // Withheld tax amount (positive number)
  netAmount: number; // Net amount after tax
  currency: string; // Currency (USD, EUR, etc.)
  taxRate: number; // Tax rate percentage
  quantity: number; // Number of shares on record date
  exDate: string; // Ex-dividend date / record date
  source?: BrokerSource;
  sourceFile?: string;
}

export interface ParsedFFData {
  trades: FFTrade[];
  dividends: FFDividend[];
  accountInfo: {
    clientName: string;
    clientCode: string;
    baseCurrency: string;
    dateStart: string;
    dateEnd: string;
  };
  source: BrokerSource;
}

/**
 * Parse Interactive Brokers FlexQuery XML
 */
export function parseIBXML(xmlContent: string): ParsedIBData {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined' && typeof DOMParser !== 'undefined';

  let xmlDoc: Document;

  if (isBrowser) {
    const parser = new DOMParser();
    xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    // Check for parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Invalid XML format');
    }
  } else {
    // For Node.js environment, use a simple regex-based parser
    // This is a fallback for testing purposes
    return parseIBXMLRegex(xmlContent);
  }

  // Extract account info
  const flexStatement = xmlDoc.querySelector('FlexStatement');
  if (!flexStatement) {
    throw new Error('No FlexStatement found in XML');
  }

  const accountId = flexStatement.getAttribute('accountId') || '';
  const fromDate = flexStatement.getAttribute('fromDate') || '';
  const toDate = flexStatement.getAttribute('toDate') || '';
  const period = flexStatement.getAttribute('period') || '';

  // Extract trades
  const trades: IBTrade[] = [];
  const lotElements = xmlDoc.querySelectorAll('Trades > Lot');

  lotElements.forEach((lot) => {
    const assetCategory = lot.getAttribute('assetCategory') || '';
    const subCategory = lot.getAttribute('subCategory') || '';

    // Only process closed lots (which have realized gains/losses)
    const openCloseIndicator = lot.getAttribute('openCloseIndicator');
    if (openCloseIndicator !== 'C') return;

    const trade: IBTrade = {
      symbol: lot.getAttribute('symbol') || '',
      description: lot.getAttribute('description') || '',
      quantity: parseFloat(lot.getAttribute('quantity') || '0'),
      tradePrice: parseFloat(lot.getAttribute('tradePrice') || '0'),
      tradeDate: formatDate(lot.getAttribute('tradeDate') || ''),
      openDateTime: formatDateTime(lot.getAttribute('openDateTime') || ''),
      reportDate: formatDate(lot.getAttribute('reportDate') || ''),
      currency: lot.getAttribute('currency') || 'USD',
      cost: parseFloat(lot.getAttribute('cost') || '0'),
      fifoPnlRealized: parseFloat(lot.getAttribute('fifoPnlRealized') || '0'),
      assetCategory,
      subCategory,
      multiplier: parseFloat(lot.getAttribute('multiplier') || '1'),
    };

    trades.push(trade);
  });

  // Extract dividends
  const dividends: IBDividend[] = [];
  const cashTransactions = xmlDoc.querySelectorAll('CashTransactions > CashTransaction');

  cashTransactions.forEach((transaction) => {
    const type = transaction.getAttribute('type') || '';

    // Only process dividends (exclude withholding tax)
    if (type === 'Dividends' || type === 'Payment In Lieu Of Dividends') {
      const dividend: IBDividend = {
        symbol: transaction.getAttribute('symbol') || '',
        description: transaction.getAttribute('description') || '',
        amount: parseFloat(transaction.getAttribute('amount') || '0'),
        date: formatDate(transaction.getAttribute('dateTime')?.split(';')[0] || ''),
        currency: transaction.getAttribute('currency') || 'USD',
        assetCategory: transaction.getAttribute('assetCategory') || 'STK',
        subCategory: transaction.getAttribute('subCategory') || 'ETF',
      };

      dividends.push(dividend);
    }
  });

  return {
    trades,
    dividends,
    accountId,
    fromDate: formatDate(fromDate),
    toDate: formatDate(toDate),
    period,
    source: 'interactive_brokers' as BrokerSource,
  };
}

/**
 * Parse IB XML using regex (fallback for Node.js)
 */
function parseIBXMLRegex(xmlContent: string): ParsedIBData {
  // Extract FlexStatement attributes
  const flexStatementMatch = xmlContent.match(
    /<FlexStatement[^>]*accountId="([^"]*)"[^>]*fromDate="([^"]*)"[^>]*toDate="([^"]*)"[^>]*period="([^"]*)"/,
  );

  const accountId = flexStatementMatch?.[1] || '';
  const fromDate = formatDate(flexStatementMatch?.[2] || '');
  const toDate = formatDate(flexStatementMatch?.[3] || '');
  const period = flexStatementMatch?.[4] || '';

  // Extract all Lot elements
  const lotRegex = /<Lot[^>]*>/g;
  const lots = xmlContent.match(lotRegex) || [];

  const trades: IBTrade[] = [];

  lots.forEach((lotTag) => {
    // Check if it's a closed lot
    const openCloseMatch = lotTag.match(/openCloseIndicator="([^"]*)"/);
    if (openCloseMatch?.[1] !== 'C') return;

    const getAttribute = (name: string): string => {
      const match = lotTag.match(new RegExp(`${name}="([^"]*)"`, 'i'));
      return match?.[1] || '';
    };

    const trade: IBTrade = {
      symbol: getAttribute('symbol'),
      description: getAttribute('description'),
      quantity: parseFloat(getAttribute('quantity') || '0'),
      tradePrice: parseFloat(getAttribute('tradePrice') || '0'),
      tradeDate: formatDate(getAttribute('tradeDate')),
      openDateTime: formatDateTime(getAttribute('openDateTime')),
      reportDate: formatDate(getAttribute('reportDate')),
      currency: getAttribute('currency') || 'USD',
      cost: parseFloat(getAttribute('cost') || '0'),
      fifoPnlRealized: parseFloat(getAttribute('fifoPnlRealized') || '0'),
      assetCategory: getAttribute('assetCategory'),
      subCategory: getAttribute('subCategory'),
      multiplier: parseFloat(getAttribute('multiplier') || '1'),
    };

    trades.push(trade);
  });

  // Extract dividends
  const cashTransactionRegex = /<CashTransaction[^>]*>/g;
  const cashTransactions = xmlContent.match(cashTransactionRegex) || [];
  const dividends: IBDividend[] = [];

  cashTransactions.forEach((transactionTag) => {
    const getAttribute = (name: string): string => {
      const match = transactionTag.match(new RegExp(`${name}="([^"]*)"`, 'i'));
      return match?.[1] || '';
    };

    const type = getAttribute('type');
    if (type === 'Dividends') {
      const amount = parseFloat(getAttribute('amount') || '0');

      if (amount > 0) {
        const dateTime = getAttribute('dateTime');
        const dividend: IBDividend = {
          symbol: getAttribute('symbol'),
          description: getAttribute('description'),
          amount: amount,
          date: formatDate(dateTime.split(';')[0]),
          currency: getAttribute('currency') || 'USD',
          assetCategory: getAttribute('assetCategory') || 'STK',
          subCategory: getAttribute('subCategory') || 'ETF',
        };

        dividends.push(dividend);
      }
    }
  });

  return {
    trades,
    dividends,
    accountId,
    fromDate,
    toDate,
    period,
    source: 'interactive_brokers' as BrokerSource,
  };
}

/**
 * Format date from YYYYMMDD to YYYY-MM-DD
 */
function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return '';

  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);

  return `${year}-${month}-${day}`;
}

/**
 * Format datetime from YYYYMMDD;HHMMSS to YYYY-MM-DD
 */
function formatDateTime(dateTimeStr: string): string {
  if (!dateTimeStr) return '';

  const datePart = dateTimeStr.split(';')[0];
  return formatDate(datePart);
}

/**
 * Group trades by symbol for easier processing
 */
export function groupTradesBySymbol(trades: IBTrade[]): Map<string, IBTrade[]> {
  const grouped = new Map<string, IBTrade[]>();

  trades.forEach((trade) => {
    const existing = grouped.get(trade.symbol) || [];
    existing.push(trade);
    grouped.set(trade.symbol, existing);
  });

  return grouped;
}

/**
 * Calculate totals from trades
 */
export function calculateTradeTotals(trades: IBTrade[]) {
  let totalCost = 0;
  let totalRevenue = 0;
  let totalProfit = 0;

  trades.forEach((trade) => {
    const assetType = determineAssetType(trade.assetCategory, trade.subCategory);

    // For stocks, use absolute value of cost
    // For options, preserve the sign (negative = received premium)
    const purchaseCost = assetType === 'stocks' ? Math.abs(trade.cost) : trade.cost;

    // For stocks: revenue = cost + fifoPnlRealized
    // For options: revenue = fifoPnlRealized (directly)
    const revenue =
      assetType === 'stocks' ? Math.abs(trade.cost) + trade.fifoPnlRealized : trade.fifoPnlRealized;

    totalCost += purchaseCost;
    totalRevenue += revenue;
    totalProfit += trade.fifoPnlRealized;
  });

  return {
    totalCost,
    totalRevenue,
    totalProfit,
  };
}

/**
 * Determine asset type from IB trade data
 */
export function determineAssetType(assetCategory: string, subCategory: string): string {
  // Options
  if (assetCategory === 'OPT') {
    return 'options';
  }

  // Stocks
  if (assetCategory === 'STK') {
    if (subCategory === 'ETF') {
      return 'stocks'; // ETFs are treated as stocks
    }
    if (subCategory === 'REIT') {
      return 'stocks'; // REITs are treated as stocks
    }
    return 'stocks';
  }

  // Bonds
  if (assetCategory === 'BOND' || subCategory === 'BOND') {
    return 'bonds';
  }

  // Crypto (if exists in IB)
  if (assetCategory === 'CRYPTO' || assetCategory === 'CRYPTOCURRENCY') {
    return 'crypto';
  }

  // Default to stocks for unknown types
  return 'stocks';
}

/**
 * Convert IB trade to form position format
 */
export function convertToFormPosition(trade: IBTrade) {
  const assetType = determineAssetType(trade.assetCategory, trade.subCategory);

  let purchasePrice: number;
  let salePrice: number;

  if (assetType === 'stocks') {
    // For stocks: cost is always positive (purchase cost)
    // Sale price = cost + fifoPnlRealized (actual sale proceeds)
    purchasePrice = Math.abs(trade.cost);
    salePrice = purchasePrice + trade.fifoPnlRealized;
  } else if (assetType === 'options') {
    // For options with negative quantity (sold/written options):
    // - We sold the option first (received premium)
    // - Then bought it back to close
    // Purchase price = absolute value of fifoPnlRealized
    // Sale price = absolute value of cost
    if (trade.quantity < 0) {
      purchasePrice = Math.abs(trade.cost + trade.fifoPnlRealized);
      salePrice = Math.abs(trade.cost);
    } else {
      // For options with positive quantity (bought options):
      // Purchase price = cost (with sign: negative = received premium, positive = paid premium)
      // Sale price = fifoPnlRealized (realized profit/loss in currency)
      purchasePrice = Math.abs(trade.cost);
      salePrice = Math.abs(trade.cost + trade.fifoPnlRealized);
    }
  } else if (assetType === 'bonds') {
    purchasePrice = trade.cost;
    salePrice = Math.abs(trade.cost + trade.fifoPnlRealized);
  } else {
    // For other asset types (bonds, crypto, etc.):
    // Use the same logic as options
    purchasePrice = trade.cost;
    salePrice = trade.fifoPnlRealized;
  }

  return {
    id: Date.now().toString() + Math.random().toString(36).substring(7),
    assetType: assetType,
    assetDescription: `${trade.symbol} - ${trade.description} (${trade.assetCategory}${trade.subCategory ? `/${trade.subCategory}` : ''})`,
    symbol: trade.symbol,
    currency: trade.currency,
    purchaseDate: trade.quantity < 0 ? trade.tradeDate : trade.openDateTime,
    saleDate: trade.quantity < 0 ? trade.openDateTime : trade.tradeDate,
    purchasePriceForeign: purchasePrice.toFixed(2),
    salePriceForeign: salePrice.toFixed(2),
    purchaseRate: '',
    saleRate: '',
    purchasePrice: '',
    salePrice: '',
    expenses: '0',
    quantity: trade.quantity.toString(),
    multiplier: trade.multiplier.toString(),
  };
}

/**
 * Convert IB dividend to form position format
 */
export function convertDividendToFormPosition(dividend: IBDividend) {
  return {
    id: Date.now().toString() + Math.random().toString(36).substring(7),
    assetType: 'dividends',
    assetDescription: `${dividend.symbol} - ${dividend.description}`,
    symbol: dividend.symbol,
    currency: dividend.currency,
    purchaseDate: '', // Not applicable for dividends
    saleDate: dividend.date, // Use dividend date as "sale" date
    purchasePriceForeign: '0',
    salePriceForeign: dividend.amount.toFixed(2),
    purchaseRate: '',
    saleRate: '',
    purchasePrice: '0',
    salePrice: '',
    expenses: '0',
    quantity: '',
    multiplier: '1',
  };
}

/**
 * Read file as text
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      if (event.target?.result) {
        resolve(event.target.result as string);
      } else {
        reject(new Error('Failed to read file'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Error reading file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Detect XML type (Interactive Brokers or Freedom Finance)
 */
export function detectXMLType(
  xmlContent: string,
): 'interactive_brokers' | 'freedom_finance' | 'unknown' {
  if (xmlContent.includes('<FlexStatement') || xmlContent.includes('<FlexQueryResponse')) {
    return 'interactive_brokers';
  }
  if (xmlContent.includes('<plainAccountInfoData>') || xmlContent.includes('<trades><detailed>')) {
    return 'freedom_finance';
  }
  return 'unknown';
}

/**
 * Parse Freedom Finance XML
 */
export function parseFFXML(xmlContent: string, sourceFileName?: string): ParsedFFData {
  const isBrowser = typeof window !== 'undefined' && typeof DOMParser !== 'undefined';

  let xmlDoc: Document;

  if (isBrowser) {
    const parser = new DOMParser();
    xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Invalid XML format');
    }
  } else {
    return parseFFXMLRegex(xmlContent, sourceFileName);
  }

  // Extract account info
  const accountInfo = {
    clientName: getTextContent(xmlDoc, 'plainAccountInfoData > client_name'),
    clientCode: getTextContent(xmlDoc, 'plainAccountInfoData > client_code'),
    baseCurrency: getTextContent(xmlDoc, 'plainAccountInfoData > base_currency'),
    dateStart: getTextContent(xmlDoc, 'date_start'),
    dateEnd: getTextContent(xmlDoc, 'date_end'),
  };

  // Extract trades
  const trades: FFTrade[] = [];
  const tradeNodes = xmlDoc.querySelectorAll('trades > detailed > node');

  tradeNodes.forEach((node) => {
    const trade: FFTrade = {
      tradeId: getTextContent(node, 'trade_id'),
      date: getTextContent(node, 'date'),
      shortDate: formatFFDate(getTextContent(node, 'short_date')),
      payDate: formatFFDate(getTextContent(node, 'pay_d')),
      symbol: getTextContent(node, 'instr_nm'),
      instrType: getTextContent(node, 'instr_type'),
      instrKind: getTextContent(node, 'instr_kind'),
      isin: getTextContent(node, 'isin'),
      operation: getTextContent(node, 'operation') as 'buy' | 'sell',
      price: parseFloat(getTextContent(node, 'p') || '0'),
      currency: getTextContent(node, 'curr_c') || 'USD',
      quantity: parseFloat(getTextContent(node, 'q') || '0'),
      sum: parseFloat(getTextContent(node, 'summ') || '0'),
      profit: parseFloat(getTextContent(node, 'profit') || '0'),
      commission: parseFloat(getTextContent(node, 'commission') || '0'),
      commissionCurrency: getTextContent(node, 'commission_currency') || 'USD',
    };

    trades.push(trade);
  });

  // Extract dividends from corporate_actions
  const dividends: FFDividend[] = [];
  const corporateActionNodes = xmlDoc.querySelectorAll('corporate_actions > detailed > node');

  corporateActionNodes.forEach((node) => {
    const typeId = getTextContent(node, 'type_id');

    // Only process dividend type corporate actions
    if (typeId === 'dividend') {
      const ticker = getTextContent(node, 'ticker');
      const comment = getTextContent(node, 'comment');
      const grossAmount = parseFloat(getTextContent(node, 'amount') || '0');
      const taxAmount = Math.abs(parseFloat(getTextContent(node, 'tax_amount') || '0'));

      // Parse tax rate from comment or use provided value
      let taxRate = 0;
      const taxRateMatch = comment.match(/Tax rate (\d+)/);
      if (taxRateMatch) {
        taxRate = parseFloat(taxRateMatch[1]);
      }

      // Calculate gross from net if we have tax rate
      // In FF XML: amount is net after tax, tax_amount is the withheld amount
      // gross = net + taxAmount
      const netAmount = grossAmount;
      const calculatedGross = netAmount + taxAmount;

      // Parse quantity from comment or use provided value
      let quantity = parseFloat(getTextContent(node, 'q_on_ex_date') || '0');
      if (!quantity) {
        const qtyMatch = comment.match(/Balance on the record date is (\d+)/);
        if (qtyMatch) {
          quantity = parseFloat(qtyMatch[1]);
        }
      }

      const dividend: FFDividend = {
        date: formatFFDate(getTextContent(node, 'date')),
        symbol: ticker,
        description: comment || `Dividend on ${ticker}`,
        isin: getTextContent(node, 'isin'),
        grossAmount: calculatedGross,
        taxAmount: taxAmount,
        netAmount: netAmount,
        currency: getTextContent(node, 'currency') || 'USD',
        taxRate: taxRate,
        quantity: quantity,
        exDate: formatFFDate(getTextContent(node, 'ex_date')),
        source: 'freedom_finance',
        sourceFile: sourceFileName,
      };

      dividends.push(dividend);
    }
  });

  return {
    trades,
    dividends,
    accountInfo,
    source: 'freedom_finance',
  };
}

/**
 * Parse Freedom Finance XML using regex (fallback for Node.js)
 */
function parseFFXMLRegex(xmlContent: string, sourceFileName?: string): ParsedFFData {
  const getTagContent = (content: string, tagName: string): string => {
    const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i');
    const match = content.match(regex);
    return match?.[1]?.trim() || '';
  };

  const accountInfo = {
    clientName: getTagContent(xmlContent, 'client_name'),
    clientCode: getTagContent(xmlContent, 'client_code'),
    baseCurrency: getTagContent(xmlContent, 'base_currency'),
    dateStart: getTagContent(xmlContent, 'date_start'),
    dateEnd: getTagContent(xmlContent, 'date_end'),
  };

  // Extract trade nodes
  const nodeRegex = /<node>([\s\S]*?)<\/node>/g;
  const tradesSection = xmlContent.match(/<trades><detailed>([\s\S]*?)<\/detailed>/)?.[1] || '';
  const nodeMatches = tradesSection.matchAll(nodeRegex);

  const trades: FFTrade[] = [];

  for (const match of nodeMatches) {
    const nodeContent = match[1];

    const trade: FFTrade = {
      tradeId: getTagContent(nodeContent, 'trade_id'),
      date: getTagContent(nodeContent, 'date'),
      shortDate: formatFFDate(getTagContent(nodeContent, 'short_date')),
      payDate: formatFFDate(getTagContent(nodeContent, 'pay_d')),
      symbol: getTagContent(nodeContent, 'instr_nm'),
      instrType: getTagContent(nodeContent, 'instr_type'),
      instrKind: getTagContent(nodeContent, 'instr_kind'),
      isin: getTagContent(nodeContent, 'isin'),
      operation: getTagContent(nodeContent, 'operation') as 'buy' | 'sell',
      price: parseFloat(getTagContent(nodeContent, 'p') || '0'),
      currency: getTagContent(nodeContent, 'curr_c') || 'USD',
      quantity: parseFloat(getTagContent(nodeContent, 'q') || '0'),
      sum: parseFloat(getTagContent(nodeContent, 'summ') || '0'),
      profit: parseFloat(getTagContent(nodeContent, 'profit') || '0'),
      commission: parseFloat(getTagContent(nodeContent, 'commission') || '0'),
      commissionCurrency: getTagContent(nodeContent, 'commission_currency') || 'USD',
    };

    trades.push(trade);
  }

  // Extract dividends from corporate_actions
  const dividends: FFDividend[] = [];
  const corporateActionsSection =
    xmlContent.match(/<corporate_actions><detailed>([\s\S]*?)<\/detailed>/)?.[1] || '';
  const caNodeMatches = corporateActionsSection.matchAll(nodeRegex);

  for (const match of caNodeMatches) {
    const nodeContent = match[1];
    const typeId = getTagContent(nodeContent, 'type_id');

    // Only process dividend type corporate actions
    if (typeId === 'dividend') {
      const ticker = getTagContent(nodeContent, 'ticker');
      const comment = getTagContent(nodeContent, 'comment');
      const grossAmount = parseFloat(getTagContent(nodeContent, 'amount') || '0');
      const taxAmount = Math.abs(parseFloat(getTagContent(nodeContent, 'tax_amount') || '0'));

      // Parse tax rate from comment
      let taxRate = 0;
      const taxRateMatch = comment.match(/Tax rate (\d+)/);
      if (taxRateMatch) {
        taxRate = parseFloat(taxRateMatch[1]);
      }

      // In FF XML: amount is net after tax
      const netAmount = grossAmount;
      const calculatedGross = netAmount + taxAmount;

      // Parse quantity from q_on_ex_date or comment
      let quantity = parseFloat(getTagContent(nodeContent, 'q_on_ex_date') || '0');
      if (!quantity) {
        const qtyMatch = comment.match(/Balance on the record date is (\d+)/);
        if (qtyMatch) {
          quantity = parseFloat(qtyMatch[1]);
        }
      }

      const dividend: FFDividend = {
        date: formatFFDate(getTagContent(nodeContent, 'date')),
        symbol: ticker,
        description: comment || `Dividend on ${ticker}`,
        isin: getTagContent(nodeContent, 'isin'),
        grossAmount: calculatedGross,
        taxAmount: taxAmount,
        netAmount: netAmount,
        currency: getTagContent(nodeContent, 'currency') || 'USD',
        taxRate: taxRate,
        quantity: quantity,
        exDate: formatFFDate(getTagContent(nodeContent, 'ex_date')),
        source: 'freedom_finance',
        sourceFile: sourceFileName,
      };

      dividends.push(dividend);
    }
  }

  return {
    trades,
    dividends,
    accountInfo,
    source: 'freedom_finance',
  };
}

/**
 * Get text content from an element
 */
function getTextContent(parent: Document | Element, selector: string): string {
  const element = parent.querySelector(selector);
  return element?.textContent?.trim() || '';
}

/**
 * Format Freedom Finance date from YYYY-MM-DD to YYYY-MM-DD (already in correct format)
 */
function formatFFDate(dateStr: string): string {
  if (!dateStr) return '';
  // FF dates are already in YYYY-MM-DD format
  return dateStr.split(' ')[0]; // Remove time part if present
}

/**
 * Group Freedom Finance trades by symbol to match buys with sells (FIFO)
 */
export function groupFFTradesBySymbol(
  trades: FFTrade[],
): Map<string, { buys: FFTrade[]; sells: FFTrade[] }> {
  const grouped = new Map<string, { buys: FFTrade[]; sells: FFTrade[] }>();

  // Sort by date
  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.shortDate).getTime() - new Date(b.shortDate).getTime(),
  );

  sortedTrades.forEach((trade) => {
    const existing = grouped.get(trade.symbol) || { buys: [], sells: [] };

    if (trade.operation === 'buy') {
      existing.buys.push(trade);
    } else if (trade.operation === 'sell') {
      existing.sells.push(trade);
    }

    grouped.set(trade.symbol, existing);
  });

  return grouped;
}

/**
 * Match Freedom Finance sells with buys using FIFO method
 * Returns matched positions for tax calculation
 */
export interface FFMatchedPosition {
  symbol: string;
  instrKind: string;
  isin: string;
  currency: string;
  buyDate: string;
  sellDate: string;
  quantity: number;
  buyPrice: number; // Total cost
  sellPrice: number; // Total proceeds
  profit: number;
  commission: number;
  source: BrokerSource;
  sourceFile?: string;
}

export function matchFFTradesFIFO(
  trades: FFTrade[],
  sourceFileName?: string,
  reportYear?: number,
): FFMatchedPosition[] {
  const grouped = groupFFTradesBySymbol(trades);
  const matchedPositions: FFMatchedPosition[] = [];

  grouped.forEach((symbolTrades, symbol) => {
    const buyQueue: { trade: FFTrade; remainingQty: number }[] = symbolTrades.buys.map((t) => ({
      trade: t,
      remainingQty: t.quantity,
    }));

    // Filter sells by report year if specified
    const sellsToProcess = reportYear
      ? symbolTrades.sells.filter((t) => new Date(t.shortDate).getFullYear() === reportYear)
      : symbolTrades.sells;

    sellsToProcess.forEach((sellTrade) => {
      let remainingToSell = sellTrade.quantity;

      while (remainingToSell > 0 && buyQueue.length > 0) {
        const firstBuy = buyQueue[0];

        if (firstBuy.remainingQty <= 0) {
          buyQueue.shift();
          continue;
        }

        const matchQty = Math.min(remainingToSell, firstBuy.remainingQty);

        // Calculate proportional costs
        const buyPricePerUnit = firstBuy.trade.price;
        const sellPricePerUnit = sellTrade.price;

        const totalBuyCost = matchQty * buyPricePerUnit;
        const totalSellProceeds = matchQty * sellPricePerUnit;
        const profit = totalSellProceeds - totalBuyCost;

        // Proportional commission from sell trade
        const commissionProportion = matchQty / sellTrade.quantity;
        const commission = sellTrade.commission * commissionProportion;

        matchedPositions.push({
          symbol: symbol,
          instrKind: sellTrade.instrKind || firstBuy.trade.instrKind,
          isin: sellTrade.isin || firstBuy.trade.isin,
          currency: sellTrade.currency,
          buyDate: firstBuy.trade.shortDate,
          sellDate: sellTrade.shortDate,
          quantity: matchQty,
          buyPrice: totalBuyCost,
          sellPrice: totalSellProceeds,
          profit: profit,
          commission: commission,
          source: 'freedom_finance',
          sourceFile: sourceFileName,
        });

        firstBuy.remainingQty -= matchQty;
        remainingToSell -= matchQty;

        if (firstBuy.remainingQty <= 0) {
          buyQueue.shift();
        }
      }
    });
  });

  return matchedPositions;
}

/**
 * Determine asset type from Freedom Finance trade data
 */
export function determineFFAssetType(instrKind: string): string {
  const kind = instrKind.toLowerCase();

  if (kind.includes('фонд') || kind.includes('etf')) {
    return 'stocks';
  }
  if (kind.includes('акція') || kind.includes('акция') || kind.includes('stock')) {
    return 'stocks';
  }
  if (kind.includes('облігація') || kind.includes('облигация') || kind.includes('bond')) {
    return 'bonds';
  }
  if (kind.includes('опціон') || kind.includes('опцион') || kind.includes('option')) {
    return 'options';
  }

  return 'stocks';
}

/**
 * Convert Freedom Finance matched position to form position format
 */
export function convertFFToFormPosition(position: FFMatchedPosition, sourceFileName?: string) {
  const assetType = determineFFAssetType(position.instrKind);

  return {
    id: Date.now().toString() + Math.random().toString(36).substring(7),
    assetType: assetType,
    assetDescription: `${position.symbol} - ${position.instrKind} (ISIN: ${position.isin})`,
    symbol: position.symbol,
    currency: position.currency,
    purchaseDate: position.buyDate,
    saleDate: position.sellDate,
    purchasePriceForeign: position.buyPrice.toFixed(2),
    salePriceForeign: position.sellPrice.toFixed(2),
    purchaseRate: '',
    saleRate: '',
    purchasePrice: '',
    salePrice: '',
    expenses: position.commission.toFixed(2),
    quantity: position.quantity.toString(),
    multiplier: '1',
    source: 'freedom_finance' as BrokerSource,
    sourceFile: sourceFileName,
  };
}

/**
 * Convert Freedom Finance dividend to form position format
 */
export function convertFFDividendToFormPosition(dividend: FFDividend, sourceFileName?: string) {
  // For dividends: we report the gross amount as income
  // The withheld foreign tax can be credited against Ukrainian tax
  return {
    id: Date.now().toString() + Math.random().toString(36).substring(7),
    assetType: 'dividends',
    assetDescription: `${dividend.symbol} - Дивіденди (ISIN: ${dividend.isin})`,
    symbol: dividend.symbol,
    currency: dividend.currency,
    purchaseDate: '', // Not applicable for dividends
    saleDate: dividend.date, // Use payment date as "sale" date for tax purposes
    purchasePriceForeign: '0',
    salePriceForeign: dividend.grossAmount.toFixed(2), // Report gross dividend amount
    purchaseRate: '',
    saleRate: '',
    purchasePrice: '0',
    salePrice: '',
    expenses: '0',
    quantity: dividend.quantity.toString(),
    multiplier: '1',
    source: 'freedom_finance' as BrokerSource,
    sourceFile: sourceFileName,
    // Additional dividend-specific fields
    withheldTax: dividend.taxAmount.toFixed(2),
    withheldTaxRate: dividend.taxRate.toString(),
    exDate: dividend.exDate,
  };
}

/**
 * Parse and convert any supported XML format
 */
export function parseAnyBrokerXML(
  xmlContent: string,
  sourceFileName?: string,
  reportYear?: number,
): {
  positions: ReturnType<typeof convertToFormPosition>[];
  source: BrokerSource;
  summary: {
    trades: number;
    dividends: number;
    totalProfit: number;
    currency: string;
  };
  warnings: string[];
} {
  const xmlType = detectXMLType(xmlContent);
  const warnings: string[] = [];

  if (xmlType === 'interactive_brokers') {
    const parsedData = parseIBXML(xmlContent);

    // Filter trades by report year if specified
    let filteredTrades = parsedData.trades;
    if (reportYear) {
      filteredTrades = parsedData.trades.filter((trade) => {
        const tradeYear = new Date(trade.tradeDate).getFullYear();
        return tradeYear === reportYear;
      });

      const skippedTrades = parsedData.trades.length - filteredTrades.length;
      if (skippedTrades > 0) {
        warnings.push(`IB: Пропущено ${skippedTrades} операцій за інші роки (не ${reportYear})`);
      }
    }

    // Filter dividends by report year if specified
    let filteredDividends = parsedData.dividends;
    if (reportYear) {
      filteredDividends = parsedData.dividends.filter((dividend) => {
        const divYear = new Date(dividend.date).getFullYear();
        return divYear === reportYear;
      });
    }

    const tradePositions = filteredTrades.map((trade) => ({
      ...convertToFormPosition(trade),
      source: 'interactive_brokers' as BrokerSource,
      sourceFile: sourceFileName,
    }));
    const dividendPositions = filteredDividends.map((dividend) => ({
      ...convertDividendToFormPosition(dividend),
      source: 'interactive_brokers' as BrokerSource,
      sourceFile: sourceFileName,
    }));

    const totals = calculateTradeTotals(filteredTrades);

    return {
      positions: [...tradePositions, ...dividendPositions],
      source: 'interactive_brokers',
      summary: {
        trades: filteredTrades.length,
        dividends: filteredDividends.length,
        totalProfit: totals.totalProfit,
        currency: filteredTrades[0]?.currency || 'USD',
      },
      warnings,
    };
  }

  if (xmlType === 'freedom_finance') {
    const parsedData = parseFFXML(xmlContent, sourceFileName);

    // Filter sells by report year and validate
    const allSells = parsedData.trades.filter((t) => t.operation === 'sell');
    let sellsForYear = allSells;

    if (reportYear) {
      sellsForYear = allSells.filter((trade) => {
        const tradeYear = new Date(trade.shortDate).getFullYear();
        return tradeYear === reportYear;
      });

      const skippedSells = allSells.length - sellsForYear.length;
      if (skippedSells > 0) {
        warnings.push(`FF: Пропущено ${skippedSells} продажів за інші роки (не ${reportYear})`);
      }
    }

    // Calculate expected sum from XML (broker-provided)
    const expectedSellSum = sellsForYear.reduce((sum, t) => sum + t.sum, 0);

    // Match trades with FIFO, passing the year filter
    const matchedPositions = matchFFTradesFIFO(parsedData.trades, sourceFileName, reportYear);

    // Calculate actual matched sum
    const actualSellSum = matchedPositions.reduce((sum, pos) => sum + pos.sellPrice, 0);

    // Validate sums match
    const sumDifference = Math.abs(expectedSellSum - actualSellSum);
    if (sumDifference > 0.01 && expectedSellSum > 0) {
      const missingSum = expectedSellSum - actualSellSum;
      warnings.push(
        `FF: Невідповідність сум! Очікувано ${expectedSellSum.toFixed(2)}, розраховано ${actualSellSum.toFixed(2)}. ` +
          `Різниця: ${missingSum.toFixed(2)}. Завантажте повний звіт брокера з усіма покупками.`,
      );
    }

    const formPositions = matchedPositions.map((pos) =>
      convertFFToFormPosition(pos, sourceFileName),
    );

    // Filter and process dividends
    let filteredDividends = parsedData.dividends;
    if (reportYear) {
      filteredDividends = parsedData.dividends.filter((dividend) => {
        const divYear = new Date(dividend.date).getFullYear();
        return divYear === reportYear;
      });

      const skippedDividends = parsedData.dividends.length - filteredDividends.length;
      if (skippedDividends > 0) {
        warnings.push(
          `FF: Пропущено ${skippedDividends} дивідендів за інші роки (не ${reportYear})`,
        );
      }
    }

    const dividendPositions = filteredDividends.map((dividend) =>
      convertFFDividendToFormPosition(dividend, sourceFileName),
    );

    const totalProfit = matchedPositions.reduce((sum, pos) => sum + pos.profit, 0);
    const totalDividends = filteredDividends.reduce((sum, div) => sum + div.grossAmount, 0);

    return {
      positions: [...formPositions, ...dividendPositions],
      source: 'freedom_finance',
      summary: {
        trades: matchedPositions.length,
        dividends: filteredDividends.length,
        totalProfit: totalProfit + totalDividends,
        currency: parsedData.accountInfo.baseCurrency || 'USD',
      },
      warnings,
    };
  }

  throw new Error(
    'Unknown XML format. Supported formats: Interactive Brokers FlexQuery, Freedom Finance',
  );
}

/**
 * Get source display name
 */
export function getSourceDisplayName(source: BrokerSource): string {
  switch (source) {
    case 'interactive_brokers':
      return 'IB';
    case 'freedom_finance':
      return 'FF';
    case 'manual':
      return 'Manual';
    default:
      return '';
  }
}

/**
 * Get source color for badges
 */
export function getSourceColor(source: BrokerSource): string {
  switch (source) {
    case 'interactive_brokers':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'freedom_finance':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'manual':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
