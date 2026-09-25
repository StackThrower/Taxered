import * as XLSX from 'xlsx';

interface FinancialPosition {
  id: string;
  assetType: string;
  assetDescription?: string;
  symbol?: string;
  currency: string;
  purchaseDate: string;
  saleDate: string;
  purchasePriceForeign: string;
  salePriceForeign: string;
  purchaseRate: string;
  saleRate: string;
  purchasePrice: string;
  salePrice: string;
  expenses: string;
  quantity?: string;
  multiplier?: string;
}

interface Calculations {
  profit: number;
  pdfo: number;
  militaryTax: number;
  total: number;
  profitFromTrades: number;
  dividends: number;
  pdfoFromTrades: number;
  pdfoFromDividends: number;
  militaryTaxFromTrades: number;
  militaryTaxFromDividends: number;
}

interface FormData {
  fullName: string;
  taxNumber: string;
  year: string;
  positions: FinancialPosition[];
  calculations: Calculations;
}

export function generateTaxCalculationExcel(formData: FormData, language: string = 'uk') {
  // Create a new workbook
  const wb = XLSX.utils.book_new();

  // Ставка военного сбора: 1.5% для года ≤2024, 5% для года ≥2025
  const reportYear = parseInt(formData.year) || 2026;
  const militaryTaxRate = reportYear >= 2025 ? 0.05 : 0.015;
  const militaryTaxPercent = (militaryTaxRate * 100).toFixed(1);

  // Translations
  const t = getTranslations(militaryTaxPercent);

  // Sheet 1: Summary
  const summaryData = [
    [t.title, '', '', ''],
    ['', '', '', ''],
    [t.personalInfo, '', '', ''],
    [t.fullName, formData.fullName, '', ''],
    [t.taxNumber, formData.taxNumber, '', ''],
    [t.year, formData.year, '', ''],
    ['', '', '', ''],
    [t.taxSummary, '', '', ''],
    [t.profit, formData.calculations.profit.toFixed(2), t.uah, ''],
    [t.pdfo, formData.calculations.pdfo.toFixed(2), t.uah, ''],
    [t.militaryTax, formData.calculations.militaryTax.toFixed(2), t.uah, ''],
    [t.totalTax, formData.calculations.total.toFixed(2), t.uah, ''],
    ['', '', '', ''],
  ];

  // Add breakdown if there are trades and/or dividends
  if (formData.calculations.profitFromTrades !== 0 || formData.calculations.dividends > 0) {
    summaryData.push([t.breakdown, '', '', '']);
    summaryData.push(['', '', '', '']);

    if (formData.calculations.profitFromTrades !== 0) {
      summaryData.push([t.tradesSection, '', '', '']);
      summaryData.push([
        t.profitFromTrades,
        formData.calculations.profitFromTrades.toFixed(2),
        t.uah,
        '',
      ]);
      summaryData.push([
        t.pdfoFromTrades,
        formData.calculations.pdfoFromTrades.toFixed(2),
        t.uah,
        t.rate18,
      ]);
      summaryData.push([
        t.militaryFromTrades,
        formData.calculations.militaryTaxFromTrades.toFixed(2),
        t.uah,
        t.rate5,
      ]);
      summaryData.push(['', '', '', '']);
    }

    if (formData.calculations.dividends > 0) {
      summaryData.push([t.dividendsSection, '', '', '']);
      summaryData.push([t.totalDividends, formData.calculations.dividends.toFixed(2), t.uah, '']);
      summaryData.push([
        t.pdfoFromDividends,
        formData.calculations.pdfoFromDividends.toFixed(2),
        t.uah,
        t.rate9,
      ]);
      summaryData.push([
        t.militaryFromDividends,
        formData.calculations.militaryTaxFromDividends.toFixed(2),
        t.uah,
        t.rate5,
      ]);
    }
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);

  // Set column widths for summary
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 15 }];

  XLSX.utils.book_append_sheet(wb, wsSummary, t.summarySheet);

  // Sheet 2: Detailed Calculations
  const detailsHeader = [
    [t.detailedCalculations],
    [''],
    [
      '№',
      t.assetType,
      t.symbol,
      t.description,
      t.quantity,
      t.multiplier,
      t.currency,
      t.purchaseDate,
      t.saleDate,
      t.purchaseAmountForeign,
      t.purchaseRate,
      t.purchaseAmountUAH,
      t.saleAmountForeign,
      t.saleRate,
      t.saleAmountUAH,
      t.expenses,
      t.profitLoss,
      t.taxRate,
      t.pdfoAmount,
      t.militaryAmount,
      t.totalAmount,
    ],
  ];

  const detailsData = formData.positions.map((pos, index) => {
    const purchasePrice = parseFloat(pos.purchasePrice) || 0;
    const salePrice = parseFloat(pos.salePrice) || 0;
    const expenses = parseFloat(pos.expenses) || 0;

    let profit = 0;
    let pdfo = 0;
    let military = 0;
    let total = 0;
    let taxRateLabel = '';

    if (pos.assetType === 'dividends') {
      // For dividends: 9% PDFO + military tax (1.5% or 5%)
      profit = salePrice;
      pdfo = salePrice * 0.09;
      military = salePrice * militaryTaxRate;
      total = pdfo + military;
      taxRateLabel = `9% + ${militaryTaxPercent}%`;
    } else {
      // For trades: 18% PDFO + military tax (1.5% or 5%) (only on profit)
      profit = salePrice - purchasePrice - expenses;
      if (profit > 0) {
        pdfo = profit * 0.18;
        military = profit * militaryTaxRate;
        total = pdfo + military;
        taxRateLabel = `18% + ${militaryTaxPercent}%`;
      } else {
        taxRateLabel = t.noTax;
      }
    }

    return [
      index + 1,
      getAssetTypeLabel(pos.assetType, language),
      pos.symbol || '-',
      pos.assetDescription || '-',
      pos.quantity || '-',
      pos.multiplier || '1',
      pos.currency,
      pos.purchaseDate || '-',
      pos.saleDate || '-',
      pos.purchasePriceForeign || '-',
      pos.purchaseRate || '1',
      purchasePrice.toFixed(2),
      pos.salePriceForeign || '-',
      pos.saleRate || '1',
      salePrice.toFixed(2),
      expenses.toFixed(2),
      profit.toFixed(2),
      taxRateLabel,
      pdfo.toFixed(2),
      military.toFixed(2),
      total.toFixed(2),
    ];
  });

  const wsDetails = XLSX.utils.aoa_to_sheet([...detailsHeader, ...detailsData]);

  // Set column widths for details
  wsDetails['!cols'] = [
    { wch: 5 }, // №
    { wch: 18 }, // Asset Type
    { wch: 12 }, // Symbol
    { wch: 25 }, // Description
    { wch: 10 }, // Quantity
    { wch: 10 }, // Multiplier
    { wch: 8 }, // Currency
    { wch: 12 }, // Purchase Date
    { wch: 12 }, // Sale Date
    { wch: 15 }, // Purchase Amount Foreign
    { wch: 12 }, // Purchase Rate
    { wch: 15 }, // Purchase Amount UAH
    { wch: 15 }, // Sale Amount Foreign
    { wch: 12 }, // Sale Rate
    { wch: 15 }, // Sale Amount UAH
    { wch: 12 }, // Expenses
    { wch: 15 }, // Profit/Loss
    { wch: 12 }, // Tax Rate
    { wch: 12 }, // PDFO
    { wch: 12 }, // Military
    { wch: 12 }, // Total
  ];

  XLSX.utils.book_append_sheet(wb, wsDetails, t.detailsSheet);

  // Sheet 3: Tax Formulas and Calculations
  const formulasData = [
    [t.formulasTitle],
    [''],
    [t.taxRatesTitle],
    [t.pdfoRate, '18%', t.forTrades],
    [t.pdfoRate, '9%', t.forDividends],
    [t.militaryRate, '5%', t.forAll],
    [''],
    [t.calculationMethodTitle],
    [''],
    [t.tradesCalculation],
    [t.step1, t.calculateProfit],
    ['', t.profitFormula],
    [t.step2, t.calculatePdfo],
    ['', t.pdfoTradesFormula],
    [t.step3, t.calculateMilitary],
    ['', t.militaryTradesFormula],
    [''],
    [t.dividendsCalculation],
    [t.step1, t.calculatePdfoDividends],
    ['', t.pdfoDividendsFormula],
    [t.step2, t.calculateMilitaryDividends],
    ['', t.militaryDividendsFormula],
    [''],
    [t.totalCalculation],
    [t.totalFormula],
    [''],
    [t.example],
    [t.exampleTrade],
    [t.purchase, '10000', t.uah],
    [t.sale, '15000', t.uah],
    [t.expenses, '500', t.uah],
    [t.profit, '4500', t.uah, '(15000 - 10000 - 500)'],
    [t.pdfo, '810', t.uah, '(4500 × 18%)'],
    [t.militaryTax, '225', t.uah, '(4500 × 5%)'],
    [t.totalTax, '1035', t.uah, '(810 + 225)'],
  ];

  const wsFormulas = XLSX.utils.aoa_to_sheet(formulasData);

  // Set column widths for formulas
  wsFormulas['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 40 }];

  XLSX.utils.book_append_sheet(wb, wsFormulas, t.formulasSheet);

  // Sheet 4: Breakdown by Asset Type
  const assetTypeBreakdown = new Map<
    string,
    {
      count: number;
      totalPurchase: number;
      totalSale: number;
      totalExpenses: number;
      totalProfit: number;
      totalPdfo: number;
      totalMilitary: number;
      totalTax: number;
    }
  >();

  // Calculate breakdown by asset type
  formData.positions.forEach((pos) => {
    const assetLabel = getAssetTypeLabel(pos.assetType, language);
    if (!assetTypeBreakdown.has(assetLabel)) {
      assetTypeBreakdown.set(assetLabel, {
        count: 0,
        totalPurchase: 0,
        totalSale: 0,
        totalExpenses: 0,
        totalProfit: 0,
        totalPdfo: 0,
        totalMilitary: 0,
        totalTax: 0,
      });
    }

    const stats = assetTypeBreakdown.get(assetLabel)!;
    const purchasePrice = parseFloat(pos.purchasePrice) || 0;
    const salePrice = parseFloat(pos.salePrice) || 0;
    const expenses = parseFloat(pos.expenses) || 0;

    stats.count++;
    stats.totalPurchase += purchasePrice;
    stats.totalSale += salePrice;
    stats.totalExpenses += expenses;

    if (pos.assetType === 'dividends') {
      stats.totalProfit += salePrice;
      stats.totalPdfo += salePrice * 0.09;
      stats.totalMilitary += salePrice * militaryTaxRate;
      stats.totalTax += salePrice * 0.09 + salePrice * militaryTaxRate;
    } else {
      const profit = salePrice - purchasePrice - expenses;
      stats.totalProfit += profit;
      if (profit > 0) {
        stats.totalPdfo += profit * 0.18;
        stats.totalMilitary += profit * militaryTaxRate;
        stats.totalTax += profit * 0.18 + profit * militaryTaxRate;
      }
    }
  });

  const breakdownData: (string | number)[][] = [
    [t.assetTypeBreakdown],
    [''],
    [
      t.assetType,
      t.positionCount,
      t.totalPurchaseAmount,
      t.totalSaleAmount,
      t.totalExpensesAmount,
      t.totalProfitAmount,
      t.pdfoAmount,
      t.militaryAmount,
      t.totalAmount,
    ],
  ];

  Array.from(assetTypeBreakdown.entries()).forEach(([assetType, stats]) => {
    breakdownData.push([
      assetType,
      stats.count,
      stats.totalPurchase.toFixed(2),
      stats.totalSale.toFixed(2),
      stats.totalExpenses.toFixed(2),
      stats.totalProfit.toFixed(2),
      stats.totalPdfo.toFixed(2),
      stats.totalMilitary.toFixed(2),
      stats.totalTax.toFixed(2),
    ]);
  });

  // Add totals row
  const grandTotals = Array.from(assetTypeBreakdown.values()).reduce(
    (acc, stats) => ({
      count: acc.count + stats.count,
      totalPurchase: acc.totalPurchase + stats.totalPurchase,
      totalSale: acc.totalSale + stats.totalSale,
      totalExpenses: acc.totalExpenses + stats.totalExpenses,
      totalProfit: acc.totalProfit + stats.totalProfit,
      totalPdfo: acc.totalPdfo + stats.totalPdfo,
      totalMilitary: acc.totalMilitary + stats.totalMilitary,
      totalTax: acc.totalTax + stats.totalTax,
    }),
    {
      count: 0,
      totalPurchase: 0,
      totalSale: 0,
      totalExpenses: 0,
      totalProfit: 0,
      totalPdfo: 0,
      totalMilitary: 0,
      totalTax: 0,
    },
  );

  breakdownData.push(['']);
  breakdownData.push([
    t.total,
    grandTotals.count,
    grandTotals.totalPurchase.toFixed(2),
    grandTotals.totalSale.toFixed(2),
    grandTotals.totalExpenses.toFixed(2),
    grandTotals.totalProfit.toFixed(2),
    grandTotals.totalPdfo.toFixed(2),
    grandTotals.totalMilitary.toFixed(2),
    grandTotals.totalTax.toFixed(2),
  ]);

  const wsBreakdown = XLSX.utils.aoa_to_sheet(breakdownData);

  // Set column widths for breakdown
  wsBreakdown['!cols'] = [
    { wch: 20 }, // Asset Type
    { wch: 12 }, // Count
    { wch: 18 }, // Total Purchase
    { wch: 18 }, // Total Sale
    { wch: 18 }, // Total Expenses
    { wch: 18 }, // Total Profit
    { wch: 15 }, // PDFO
    { wch: 15 }, // Military
    { wch: 15 }, // Total
  ];

  XLSX.utils.book_append_sheet(wb, wsBreakdown, t.breakdownSheet);

  // Generate and download the file
  const fileName = `${t.fileName}_${formData.fullName.replace(/\s+/g, '_')}_${formData.year}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

function getAssetTypeLabel(assetType: string, language: string): string {
  const labels: Record<string, Record<string, string>> = {
    uk: {
      stocks: 'Акції',
      bonds: 'Облігації',
      options: 'Опціони',
      futures: "Ф'ючерси",
      crypto: 'Криптовалюта',
      dividends: 'Дивіденди',
      other: 'Інше',
    },
    en: {
      stocks: 'Stocks',
      bonds: 'Bonds',
      options: 'Options',
      futures: 'Futures',
      crypto: 'Cryptocurrency',
      dividends: 'Dividends',
      other: 'Other',
    },
    pl: {
      stocks: 'Akcje',
      bonds: 'Obligacje',
      options: 'Opcje',
      futures: 'Kontrakty futures',
      crypto: 'Kryptowaluty',
      dividends: 'Dywidendy',
      other: 'Inne',
    },
    de: {
      stocks: 'Aktien',
      bonds: 'Anleihen',
      options: 'Optionen',
      futures: 'Futures',
      crypto: 'Kryptowährung',
      dividends: 'Dividenden',
      other: 'Sonstiges',
    },
    es: {
      stocks: 'Acciones',
      bonds: 'Bonos',
      options: 'Opciones',
      futures: 'Futuros',
      crypto: 'Criptomonedas',
      dividends: 'Dividendos',
      other: 'Otro',
    },
    fr: {
      stocks: 'Actions',
      bonds: 'Obligations',
      options: 'Options',
      futures: 'Contrats à terme',
      crypto: 'Cryptomonnaie',
      dividends: 'Dividendes',
      other: 'Autre',
    },
    pt: {
      stocks: 'Ações',
      bonds: 'Títulos',
      options: 'Opções',
      futures: 'Futuros',
      crypto: 'Criptomoeda',
      dividends: 'Dividendos',
      other: 'Outro',
    },
  };

  return labels[language]?.[assetType] || labels['en'][assetType] || assetType;
}

// The app is Ukrainian-only; the Excel export always uses the Ukrainian labels.
function getTranslations(militaryTaxPercent: string = '5') {
  const translations = {
    uk: {
      title: "Розрахунок податкових зобов'язань (Додаток Ф1 / F0121214)",
      personalInfo: 'Персональна інформація',
      fullName: 'ПІБ',
      taxNumber: 'ІПН',
      year: 'Рік',
      taxSummary: 'Підсумок податків',
      profit: 'Прибуток/Збиток',
      pdfo: 'ПДФО',
      militaryTax: 'Військовий збір',
      totalTax: 'Всього до сплати',
      uah: 'грн',
      breakdown: 'Деталізація розрахунків',
      tradesSection: 'Трейди (Акції, Опціони, Облігації)',
      profitFromTrades: 'Прибуток/Збиток від трейдів',
      pdfoFromTrades: 'ПДФО від трейдів',
      militaryFromTrades: 'Військовий збір від трейдів',
      dividendsSection: 'Дивіденди',
      totalDividends: 'Всього дивідендів',
      pdfoFromDividends: 'ПДФО від дивідендів',
      militaryFromDividends: 'Військовий збір від дивідендів',
      rate18: '(18%)',
      rate9: '(9%)',
      rate5: `(${militaryTaxPercent}%)`,
      summarySheet: 'Підсумок',
      detailedCalculations: 'Детальні розрахунки по кожній позиції',
      assetType: 'Тип активу',
      symbol: 'Тикер',
      description: 'Опис',
      quantity: 'Кількість',
      multiplier: 'Множник',
      currency: 'Валюта',
      purchaseDate: 'Дата купівлі',
      saleDate: 'Дата продажу',
      purchaseAmountForeign: 'Купівля (валюта)',
      purchaseRate: 'Курс купівлі',
      purchaseAmountUAH: 'Купівля (грн)',
      saleAmountForeign: 'Продаж (валюта)',
      saleRate: 'Курс продажу',
      saleAmountUAH: 'Продаж (грн)',
      expenses: 'Витрати',
      profitLoss: 'Прибуток/Збиток',
      taxRate: 'Ставка податку',
      noTax: 'Немає податку (збиток)',
      pdfoAmount: 'ПДФО',
      militaryAmount: 'Військ. збір',
      totalAmount: 'Всього',
      total: 'Разом',
      detailsSheet: 'Детальні розрахунки',
      formulasTitle: 'Формули розрахунку податків',
      taxRatesTitle: 'Ставки податків:',
      pdfoRate: 'ПДФО',
      militaryRate: 'Військовий збір',
      forTrades: 'Для трейдів',
      forDividends: 'Для дивідендів',
      forAll: 'Для всіх доходів',
      calculationMethodTitle: 'Методика розрахунку:',
      tradesCalculation: 'Для трейдів (акції, опціони, облігації):',
      step1: 'Крок 1:',
      step2: 'Крок 2:',
      step3: 'Крок 3:',
      calculateProfit: 'Розрахунок прибутку/збитку',
      profitFormula: 'Прибуток = Продаж - Купівля - Витрати',
      calculatePdfo: 'Розрахунок ПДФО',
      pdfoTradesFormula: 'ПДФО = Прибуток × 18% (якщо прибуток > 0)',
      calculateMilitary: 'Розрахунок військового збору',
      militaryTradesFormula: `Військовий збір = Прибуток × ${militaryTaxPercent}% (якщо прибуток > 0)`,
      dividendsCalculation: 'Для дивідендів:',
      calculatePdfoDividends: 'Розрахунок ПДФО (знижена ставка)',
      pdfoDividendsFormula: 'ПДФО = Дивіденди × 9%',
      calculateMilitaryDividends: 'Розрахунок військового збору',
      militaryDividendsFormula: `Військовий збір = Дивіденди × ${militaryTaxPercent}%`,
      totalCalculation: 'Загальна сума податків:',
      totalFormula: 'Всього = ПДФО + Військовий збір',
      example: 'Приклад розрахунку:',
      exampleTrade: 'Трейд з акціями:',
      purchase: 'Купівля',
      sale: 'Продаж',
      formulasSheet: 'Формули та приклади',
      fileName: 'Розрахунок_податків',
      assetTypeBreakdown: 'Розбивка по типах активів',
      positionCount: 'Кількість позицій',
      totalPurchaseAmount: 'Сума купівлі (грн)',
      totalSaleAmount: 'Сума продажу (грн)',
      totalExpensesAmount: 'Витрати (грн)',
      totalProfitAmount: 'Прибуток (грн)',
      breakdownSheet: 'По типах активів',
    },
  };

  return translations.uk;
}
