import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { setupUkrainianFonts } from './pdf-fonts';

export interface F0121214Position {
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

export interface F0121214Data {
  fullName: string;
  taxNumber: string;
  year: string;
  notes: string;
  positions: F0121214Position[];
  calculations: {
    profit: number;
    pdfo: number;
    militaryTax: number;
    total: number;
    profitFromTrades?: number;
    dividends?: number;
    pdfoFromTrades?: number;
    pdfoFromDividends?: number;
    militaryTaxFromTrades?: number;
    militaryTaxFromDividends?: number;
  };
}

export const generateF0121214PDF = async (
  data: F0121214Data,
  language: string = 'uk',
  createCopy: boolean = true,
) => {
  const doc = new jsPDF();
  // jspdf-autotable records where the last table ended on the document.
  const lastTableEnd = () =>
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // Setup Ukrainian fonts for Cyrillic support
  await setupUkrainianFonts(doc);

  // Ставка военного сбора: 1.5% для года ≤2024, 5% для года ≥2025
  const reportYear = parseInt(data.year) || 2026;
  const militaryTaxRate = reportYear >= 2025 ? 5 : 1.5;
  const militaryTaxPercent = militaryTaxRate.toFixed(1).replace('.0', '');

  const labels = {
    uk: {
      title: 'ПРИКЛАД ДЛЯ ЗАПОВНЕННЯ ПОДАТКОВОЇ ДЕКЛАРАЦІЇ',
      formNumber: 'Ф0121214 (Ф1)',
      subtitle: 'про майновий стан і доходи',
      officialNote: 'Додаток Ф1 до річної податкової декларації',
      copyLabel: 'КОПІЯ',
      originalLabel: 'ОРИГІНАЛ',
      personalData: 'I. ВІДОМОСТІ ПРО ПЛАТНИКА ПОДАТКУ',
      fullName: "Прізвище, ім'я, по батькові:",
      taxNumber: 'Реєстраційний номер облікової картки платника податків (ІПН):',
      year: 'Звітний (податковий) період (рік):',
      positions: 'II. ВІДОМОСТІ ПРО ІНВЕСТИЦІЙНІ ПРИБУТКИ',
      position: 'Позиція',
      assetType: 'Вид активу:',
      symbol: 'Тикер:',
      currency: 'Валюта:',
      quantity: 'Кількість:',
      multiplier: 'Множник:',
      purchaseDate: 'Дата придбання:',
      saleDate: 'Дата продажу/отримання:',
      purchasePriceForeign: 'Сума купівлі (валюта):',
      salePriceForeign: 'Сума продажу (валюта):',
      purchaseRate: 'Курс НБУ на дату придбання:',
      saleRate: 'Курс НБУ на дату продажу:',
      purchasePrice: 'Вартість придбання (грн):',
      salePrice: 'Вартість продажу (грн):',
      expenses: 'Документально підтверджені витрати (грн):',
      positionProfit: 'Фінансовий результат (грн):',
      taxSummary: "III. РОЗРАХУНОК ПОДАТКОВИХ ЗОБОВ'ЯЗАНЬ",
      totalProfit: 'Загальний інвестиційний прибуток:',
      pdfo: 'Податок на доходи фізичних осіб (ПДФО):',
      militaryTax: 'Військовий збір:',
      totalTax: 'ЗАГАЛЬНА СУМА ДО СПЛАТИ:',
      notes: 'IV. ДОДАТКОВА ІНФОРМАЦІЯ',
      generatedDate: 'Дата формування декларації:',
      signature: 'Підпис платника податку',
      signatureLine: '_________________',
      assetTypes: {
        stocks: 'Акції',
        bonds: 'Облігації',
        options: 'Опціони',
        dividends: 'Дивіденди',
        crypto: 'Криптовалюта',
        real_estate: 'Нерухоме майно',
        other: 'Інше',
      },
      taxRates: {
        trades: `Операції з цінними паперами (18% ПДФО + ${militaryTaxPercent}% ВЗ)`,
        dividends: `Дивіденди (9% ПДФО + ${militaryTaxPercent}% ВЗ)`,
      },
    },
    en: {
      title: 'EXAMPLE FOR FILLING OUT TAX DECLARATION',
      formNumber: 'F0121214 (F1)',
      subtitle: 'on property status and income',
      officialNote: 'Appendix F1 to annual tax return',
      copyLabel: 'COPY',
      originalLabel: 'ORIGINAL',
      personalData: 'I. INFORMATION ABOUT THE TAXPAYER',
      fullName: 'Full name:',
      taxNumber: 'Taxpayer identification number (TIN):',
      year: 'Reporting (tax) period (year):',
      positions: 'II. INFORMATION ABOUT INVESTMENT INCOME',
      position: 'Position',
      assetType: 'Asset type:',
      symbol: 'Symbol:',
      currency: 'Currency:',
      quantity: 'Quantity:',
      multiplier: 'Multiplier:',
      purchaseDate: 'Purchase date:',
      saleDate: 'Sale/receipt date:',
      purchasePriceForeign: 'Purchase amount (foreign currency):',
      salePriceForeign: 'Sale amount (foreign currency):',
      purchaseRate: 'NBU rate on purchase date:',
      saleRate: 'NBU rate on sale date:',
      purchasePrice: 'Purchase cost (UAH):',
      salePrice: 'Sale value (UAH):',
      expenses: 'Documented expenses (UAH):',
      positionProfit: 'Financial result (UAH):',
      taxSummary: 'III. TAX LIABILITY CALCULATION',
      totalProfit: 'Total investment profit:',
      pdfo: 'Personal income tax (PIT):',
      militaryTax: 'Military levy:',
      totalTax: 'TOTAL AMOUNT DUE:',
      notes: 'IV. ADDITIONAL INFORMATION',
      generatedDate: 'Declaration date:',
      signature: 'Taxpayer signature',
      signatureLine: '_________________',
      assetTypes: {
        stocks: 'Stocks',
        bonds: 'Bonds',
        options: 'Options',
        dividends: 'Dividends',
        crypto: 'Cryptocurrency',
        real_estate: 'Real Estate',
        other: 'Other',
      },
      taxRates: {
        trades: `Securities transactions (18% PIT + ${militaryTaxPercent}% ML)`,
        dividends: `Dividends (9% PIT + ${militaryTaxPercent}% ML)`,
      },
    },
  };

  const t = labels[language as keyof typeof labels] || labels.en;

  // Function to generate document content (original or copy)
  const generateContent = (isCopy: boolean) => {
    // Header - Official format
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text(t.title, 105, 15, { align: 'center' });

    doc.setFontSize(13);
    doc.text(t.formNumber, 105, 23, { align: 'center' });

    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(11);
    doc.text(t.subtitle, 105, 30, { align: 'center' });

    // Official note
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(t.officialNote, 105, 36, { align: 'center' });

    // Original/Copy marker
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(11);
    if (isCopy) {
      doc.setTextColor(200, 0, 0);
      doc.text(t.copyLabel, 180, 25, { align: 'right' });
    } else {
      doc.setTextColor(0, 100, 0);
      doc.text(t.originalLabel, 180, 25, { align: 'right' });
    }

    let yPos = 48;

    // Personal Data Section
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(t.personalData, 15, yPos);
    yPos += 10;

    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    const personalData = [
      [t.fullName, data.fullName || '-'],
      [t.taxNumber, data.taxNumber || '-'],
      [t.year, data.year || '-'],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: personalData,
      theme: 'grid',
      styles: {
        font: 'DejaVuSans',
        fontStyle: 'normal',
        fontSize: 9,
        cellPadding: 3,
      },
      columnStyles: {
        0: { font: 'DejaVuSans', fontStyle: 'bold', cellWidth: 80 },
        1: { font: 'DejaVuSans', cellWidth: 100 },
      },
    });

    yPos = lastTableEnd() + 12;

    // Positions Section
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(t.positions, 15, yPos);
    yPos += 8;

    data.positions.forEach((position, index) => {
      const purchasePrice = parseFloat(position.purchasePrice) || 0;
      const salePrice = parseFloat(position.salePrice) || 0;
      const expenses = parseFloat(position.expenses) || 0;

      const profit =
        position.assetType === 'dividends'
          ? salePrice
          : Math.max(0, salePrice - purchasePrice - expenses);

      const assetTypeLabel =
        t.assetTypes[position.assetType as keyof typeof t.assetTypes] || position.assetType || '-';

      const currency = position.currency || 'UAH';
      const purchasePriceForeign = parseFloat(position.purchasePriceForeign) || 0;
      const salePriceForeign = parseFloat(position.salePriceForeign) || 0;
      const purchaseRate = parseFloat(position.purchaseRate) || 0;
      const saleRate = parseFloat(position.saleRate) || 0;

      doc.setFont('DejaVuSans', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);
      doc.text(`${t.position} #${index + 1}`, 15, yPos);
      yPos += 7;

      const positionData = [[t.assetType, assetTypeLabel]];

      // Add symbol/ticker if available
      if (position.symbol) {
        positionData.push([t.symbol, position.symbol]);
      }

      positionData.push([t.currency, currency]);

      // Add quantity for stocks and options
      if (position.assetType !== 'dividends' && position.quantity) {
        const quantity = parseFloat(position.quantity) || 0;
        const multiplier = parseFloat(position.multiplier || '1') || 1;
        if (quantity !== 0) {
          positionData.push([t.quantity, quantity.toString()]);
          if (multiplier !== 1) {
            positionData.push([t.multiplier, multiplier.toString()]);
          }
        }
      }

      if (position.assetType !== 'dividends') {
        positionData.push(
          [t.purchaseDate, position.purchaseDate || '-'],
          [t.saleDate, position.saleDate || '-'],
        );
      } else {
        positionData.push([t.saleDate, position.saleDate || '-']);
      }

      if (currency !== 'UAH') {
        if (position.assetType !== 'dividends' && purchasePriceForeign > 0) {
          positionData.push(
            [t.purchasePriceForeign, `${purchasePriceForeign.toFixed(2)} ${currency}`],
            [t.purchaseRate, purchaseRate > 0 ? `${purchaseRate.toFixed(4)}` : '-'],
          );
        }
        if (salePriceForeign > 0) {
          positionData.push(
            [
              position.assetType === 'dividends' ? 'Дивіденди (валюта):' : t.salePriceForeign,
              `${salePriceForeign.toFixed(2)} ${currency}`,
            ],
            [
              position.assetType === 'dividends' ? 'Курс НБУ:' : t.saleRate,
              saleRate > 0 ? `${saleRate.toFixed(4)}` : '-',
            ],
          );
        }
      }

      if (position.assetType !== 'dividends' && purchasePrice > 0) {
        positionData.push([t.purchasePrice, `${purchasePrice.toFixed(2)} UAH`]);
      }
      positionData.push([
        position.assetType === 'dividends' ? 'Дивіденди (UAH):' : t.salePrice,
        `${salePrice.toFixed(2)} UAH`,
      ]);
      if (position.assetType !== 'dividends' && expenses > 0) {
        positionData.push([t.expenses, `${expenses.toFixed(2)} UAH`]);
      }
      positionData.push([
        position.assetType === 'dividends' ? 'Оподатковувана сума:' : t.positionProfit,
        `${profit.toFixed(2)} UAH`,
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [],
        body: positionData,
        theme: 'striped',
        styles: {
          font: 'DejaVuSans',
          fontStyle: 'normal',
          fontSize: 8,
          cellPadding: 2,
        },
        columnStyles: {
          0: { font: 'DejaVuSans', fontStyle: 'bold', cellWidth: 80 },
          1: { font: 'DejaVuSans', cellWidth: 100 },
        },
      });

      yPos = lastTableEnd() + 8;

      if (yPos > 250 && index < data.positions.length - 1) {
        doc.addPage();
        yPos = 20;
      }
    });

    // Tax Summary Section
    if (yPos > 220) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(t.taxSummary, 15, yPos);
    yPos += 8;

    const taxData = [];

    if (
      data.calculations.profitFromTrades !== undefined &&
      data.calculations.profitFromTrades !== 0
    ) {
      taxData.push(
        [
          `${language === 'uk' ? 'Прибуток від операцій з ЦП:' : 'Profit from securities:'}`,
          `${(data.calculations.profitFromTrades || 0).toFixed(2)} UAH`,
        ],
        [
          `${language === 'uk' ? '  - ПДФО (18%):' : '  - PIT (18%):'}`,
          `${(data.calculations.pdfoFromTrades || 0).toFixed(2)} UAH`,
        ],
        [
          `${language === 'uk' ? `  - Військовий збір (${militaryTaxPercent}%):` : `  - Military levy (${militaryTaxPercent}%):`}`,
          `${(data.calculations.militaryTaxFromTrades || 0).toFixed(2)} UAH`,
        ],
      );
    }

    if (data.calculations.dividends !== undefined && data.calculations.dividends > 0) {
      taxData.push(
        [
          `${language === 'uk' ? 'Дивіденди отримано:' : 'Dividends received:'}`,
          `${(data.calculations.dividends || 0).toFixed(2)} UAH`,
        ],
        [
          `${language === 'uk' ? '  - ПДФО (9%):' : '  - PIT (9%):'}`,
          `${(data.calculations.pdfoFromDividends || 0).toFixed(2)} UAH`,
        ],
        [
          `${language === 'uk' ? `  - Військовий збір (${militaryTaxPercent}%):` : `  - Military levy (${militaryTaxPercent}%):`}`,
          `${(data.calculations.militaryTaxFromDividends || 0).toFixed(2)} UAH`,
        ],
      );
    }

    taxData.push(
      ['', ''],
      [t.totalProfit, `${data.calculations.profit.toFixed(2)} UAH`],
      [t.pdfo, `${data.calculations.pdfo.toFixed(2)} UAH`],
      [t.militaryTax, `${data.calculations.militaryTax.toFixed(2)} UAH`],
    );

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: taxData,
      theme: 'plain',
      styles: {
        font: 'DejaVuSans',
        fontStyle: 'normal',
        fontSize: 9,
        cellPadding: 3,
      },
      columnStyles: {
        0: { font: 'DejaVuSans', fontStyle: 'bold', cellWidth: 80 },
        1: { font: 'DejaVuSans', cellWidth: 100, halign: 'right' },
      },
    });

    yPos = lastTableEnd() + 5;

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: [[t.totalTax, `${data.calculations.total.toFixed(2)} UAH`]],
      theme: 'grid',
      styles: {
        font: 'DejaVuSans',
        fontSize: 10,
        cellPadding: 4,
        fontStyle: 'bold',
        fillColor: [240, 240, 255],
      },
      columnStyles: {
        0: { font: 'DejaVuSans', cellWidth: 80 },
        1: { font: 'DejaVuSans', cellWidth: 100, halign: 'right' },
      },
    });

    yPos = lastTableEnd() + 12;

    // Notes
    if (data.notes) {
      doc.setFont('DejaVuSans', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text(t.notes, 15, yPos);
      yPos += 7;

      doc.setFont('DejaVuSans', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      const splitText = doc.splitTextToSize(data.notes, 180);
      doc.text(splitText, 15, yPos);
      yPos += splitText.length * 4 + 10;
    }

    // Signature section
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    } else {
      yPos += 8;
    }

    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text(t.signature, 15, yPos);
    doc.text(t.signatureLine, 80, yPos);

    return doc.getNumberOfPages();
  };

  // Generate original
  const originalPages = generateContent(false);

  // Add footer to original pages
  doc.setFont('DejaVuSans', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  for (let i = 1; i <= originalPages; i++) {
    doc.setPage(i);
    doc.text(
      `${t.generatedDate} ${new Date().toLocaleDateString()} | Сторінка ${i} з ${originalPages}`,
      105,
      285,
      { align: 'center' },
    );
  }

  // Generate copy if requested
  if (createCopy) {
    // Add separator page
    doc.addPage();
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(100, 100, 100);
    doc.text('--- КОПІЯ / COPY ---', 105, 140, { align: 'center' });

    // Generate copy content
    doc.addPage();
    const copyStartPage = originalPages + 2;
    // generateContent returns the document's total page count, which is the copy's last page.
    const copyEndPage = generateContent(true);

    // Add footer to copy pages
    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    for (let i = copyStartPage; i <= copyEndPage; i++) {
      doc.setPage(i);
      const pageNum = i - copyStartPage + 1;
      const totalCopyPages = copyEndPage - copyStartPage + 1;
      doc.text(
        `${t.copyLabel} | ${t.generatedDate} ${new Date().toLocaleDateString()} | Сторінка ${pageNum} з ${totalCopyPages}`,
        105,
        285,
        { align: 'center' },
      );
    }
  }

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `F0121214_${data.taxNumber || 'NN'}_${data.year}_${timestamp}.pdf`;

  // Save and open
  doc.save(filename);
  window.open(doc.output('bloburl'), '_blank');
};
