/**
 * Ф1 sub-agent: the annex F0121215 to the declaration F0100215 — investment income of the year,
 * PDFO and military levy. Every figure comes from `calculateTaxes` (kopeck arithmetic, the
 * same code the XSD-validated XML export uses); the model only orchestrates.
 */
import { tool } from '@langchain/core/tools';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  ASSET_TYPES,
  DEFAULT_REPORT_YEAR,
  REPORT_YEARS,
  calculateTaxes,
  calculationNotes,
  type FinancialPosition,
  type TaxOptions,
} from '../../app/declaration/f0121214/tax-model';
import { buildDeclarationPackage } from '../../app/lib/dps-xml/package';
import { toHryvnias } from '../../app/lib/dps-xml/money';
import { renderTaxCalculationExcel } from '../../app/lib/excel-generator';
import { parseAnyBrokerXML, withFreedomEntity } from '../../app/lib/ib-xml-parser';
import { fetchNBUExchangeRate } from '../../app/lib/nbu-exchange-rates';
import { renderF0121214PDF } from '../../app/lib/pdf-generator';
import type { FontLoader } from '../../app/lib/pdf-fonts';
import { applyNbuRates } from '../../app/lib/position-rates';
import {
  artifactId,
  emitArtifact,
  emitFile,
  errorText,
  mapLimited,
  pickFiles,
  result,
  sessionOf,
} from '../context';
import type { F1State, Session } from '../session';

export const F1_PROMPT = `You are the Ф1 sub-agent of Taxered, a Ukrainian tax assistant. You prepare annex Ф1 (F0121215) to the property and income declaration F0100215 for a Ukrainian tax resident: investment income (stocks, bonds, options, crypto), foreign dividends and interest, PDFO (18%, dividends 9%) and military levy (1.5% up to 2024, 5% from 2025).

How to work:
- Never compute taxes, rates or totals yourself. Import or add positions with the tools, then call calculate_f1; report only the figures the tools return.
- Broker reports: Interactive Brokers Flex Query XML and Freedom Finance XML. The tools convert every amount at the NBU rate of its own date.
- If the report year is not given, ask for it unless the task makes it clear; default to the year most sales happened in.
- A Freedom Finance report may not say which company issued it. If the tool asks, ask the user: Freedom Finance Europe (foreign broker, code 4) or Фрідом Фінанс Україна (Ukrainian tax agent, code 2).
- Optional annual inputs: loss of previous years (Ф1 row 2), tax withheld by a Ukrainian broker (rows 4.1/5.1), foreign tax credit with a legalised certificate (declaration row 18).
- Files: export_f1_documents makes a PDF and an Excel workbook (need only the name and tax number, or "anonymous"), and the XML package for the DPS e-cabinet (needs full name, tax number (РНОКПП), tax office code and name, city and street of the tax address). Ask for missing details; never invent them.
- The chat shows the Ф1 form, its chart and the files automatically; summarise the key figures and warnings in a few sentences instead of repeating tables.
- Reply in the user's language (Ukrainian by default). This is a calculation aid, not legal advice; say so once when you give the totals.`;

const RATE_CONCURRENCY = 6;

const assetTypes = ASSET_TYPES.map((a) => a.value) as [string, ...string[]];

function f1State(session: Session, year?: string): F1State {
  if (!session.f1) {
    session.f1 = { year: year ?? DEFAULT_REPORT_YEAR, positions: [], options: {} };
  }
  if (year) {
    session.f1.year = year;
  }
  return session.f1;
}

function yearString(year: number | undefined): string | undefined {
  if (year === undefined) {
    return undefined;
  }
  const value = String(year);
  if (!REPORT_YEARS.includes(value)) {
    throw new Error(`Підтримувані роки звіту: ${REPORT_YEARS.join(', ')}.`);
  }
  return value;
}

const importBrokerReports = tool(
  async ({ fileIds, year, freedomEntity, append }, config) => {
    const session = sessionOf(config);
    const reportYear = yearString(year)!;
    const files = await pickFiles(session, fileIds, ['ib_xml', 'ff_xml']);
    const imported: FinancialPosition[] = [];
    const summaries: unknown[] = [];
    const warnings: string[] = [];
    const needsEntity: string[] = [];

    for (const file of files) {
      try {
        const parsed = parseAnyBrokerXML(file.content, file.name, year);
        warnings.push(...parsed.warnings.map((w) => `${file.name}: ${w}`));
        let positions = parsed.positions;
        if (parsed.source === 'freedom_finance' && parsed.freedomEntity === null) {
          if (!freedomEntity) {
            needsEntity.push(file.name);
            continue;
          }
          positions = positions.map((p) => withFreedomEntity(p, freedomEntity));
        }
        imported.push(...positions);
        summaries.push({
          file: file.name,
          broker: parsed.source,
          trades: parsed.summary.trades,
          dividends: parsed.summary.dividends,
          brokerProfit: parsed.summary.totalProfit,
          currency: parsed.summary.currency,
        });
      } catch (error) {
        warnings.push(`${file.name}: ${errorText(error)}`);
      }
    }

    const withRates = await mapLimited(imported, RATE_CONCURRENCY, async (p) =>
      p.currency !== 'UAH' && p.saleDate ? applyNbuRates(p, fetchNBUExchangeRate) : p,
    );
    const missingRates = withRates.filter(
      (p) => p.currency !== 'UAH' && p.saleDate && !p.salePrice,
    ).length;
    if (missingRates > 0) {
      warnings.push(`Не вдалося отримати курс НБУ для ${missingRates} позицій — перевірте їх.`);
    }

    const state = f1State(session, reportYear);
    state.positions = append ? [...state.positions, ...withRates] : withRates;

    return result({
      imported: withRates.length,
      totalPositions: state.positions.length,
      year: reportYear,
      files: summaries,
      warnings,
      ...(needsEntity.length > 0 && {
        needsInput: `Не видно, яка компанія Freedom Finance видала ${needsEntity.join(', ')}. Запитайте користувача: Freedom Finance Europe (іноземний брокер) чи Фрідом Фінанс Україна (податковий агент), і повторіть імпорт з freedomEntity.`,
      }),
      next: 'Call calculate_f1 to compute the annex.',
    });
  },
  {
    name: 'import_broker_reports',
    description:
      'Import closed positions and dividends of the report year from uploaded Interactive Brokers Flex Query XML / Freedom Finance XML files, converting amounts at NBU rates. Replaces the current Ф1 positions unless append is true.',
    schema: z.object({
      fileIds: z
        .array(z.string())
        .optional()
        .describe('Ids of the files to import; all broker XML files of the chat if omitted.'),
      year: z.number().int().describe('Report (tax) year, e.g. 2025.'),
      freedomEntity: z
        .enum(['europe', 'ukraine'])
        .optional()
        .describe('Freedom Finance company, only when the tool asked for it.'),
      append: z
        .boolean()
        .optional()
        .describe('Add to the existing positions instead of replacing.'),
    }),
  },
);

const addManualPosition = tool(
  async (input, config) => {
    const session = sessionOf(config);
    const state = f1State(session, yearString(input.year));
    const foreign = input.currency !== 'UAH';
    const base: FinancialPosition = {
      id: `manual-${state.positions.length + 1}-${Date.now().toString(36)}`,
      assetType: input.assetType,
      assetDescription: input.description,
      symbol: input.symbol,
      currency: input.currency,
      purchaseDate: input.purchaseDate ?? '',
      saleDate: input.saleDate,
      purchasePriceForeign: foreign ? String(input.purchaseAmount ?? 0) : '',
      salePriceForeign: foreign ? String(input.saleAmount) : '',
      purchaseRate: '1',
      saleRate: '1',
      purchasePrice: foreign ? '' : String(input.purchaseAmount ?? 0),
      salePrice: foreign ? '' : String(input.saleAmount),
      expenses: input.expensesUah ? String(input.expensesUah) : '',
      source: 'manual',
      brokerJurisdiction: input.ukrainianBroker ? 'ua' : 'foreign',
    };
    const position = foreign ? await applyNbuRates(base, fetchNBUExchangeRate) : base;
    if (foreign && !position.salePrice) {
      throw new Error(`НБУ не має курсу ${input.currency} на ${input.saleDate}.`);
    }
    state.positions = [...state.positions, position];
    return result({
      added: {
        id: position.id,
        purchaseUah: position.purchasePrice,
        saleUah: position.salePrice,
        purchaseRate: position.purchaseRate,
        saleRate: position.saleRate,
      },
      totalPositions: state.positions.length,
    });
  },
  {
    name: 'add_manual_position',
    description:
      'Add one position the user described in words (a sale, a dividend, interest). Amounts are in the position currency; foreign amounts are converted at NBU rates of the purchase and sale dates.',
    schema: z.object({
      year: z.number().int().optional().describe('Report year, if not set yet.'),
      assetType: z.enum(assetTypes),
      description: z.string().optional(),
      symbol: z.string().optional(),
      currency: z.string().length(3).describe('ISO code, e.g. USD, EUR, UAH.'),
      purchaseDate: z
        .string()
        .optional()
        .describe('YYYY-MM-DD; not needed for dividends and interest.'),
      saleDate: z.string().describe('YYYY-MM-DD; payment date for dividends and interest.'),
      purchaseAmount: z.number().nonnegative().optional().describe('Total cost in the currency.'),
      saleAmount: z.number().nonnegative().describe('Total proceeds (or gross dividend).'),
      expensesUah: z.number().nonnegative().optional().describe('Documented costs in UAH.'),
      ukrainianBroker: z.boolean().optional().describe('Bought through a Ukrainian broker.'),
    }),
  },
);

const removePositions = tool(
  async ({ ids }, config) => {
    const state = f1State(sessionOf(config));
    const before = state.positions.length;
    state.positions = ids ? state.positions.filter((p) => !ids.includes(p.id)) : [];
    return result({ removed: before - state.positions.length, left: state.positions.length });
  },
  {
    name: 'remove_positions',
    description: 'Remove Ф1 positions by id, or all of them when ids is omitted (start over).',
    schema: z.object({ ids: z.array(z.string()).optional() }),
  },
);

const calculateF1 = tool(
  async (input, config) => {
    const session = sessionOf(config);
    const state = f1State(session, yearString(input.year));
    if (state.positions.length === 0) {
      throw new Error('Немає позицій: імпортуйте звіт брокера або додайте операції.');
    }
    const options: TaxOptions = { ...state.options };
    for (const key of [
      'previousYearsLoss',
      'withheldPdfo',
      'withheldMilitaryLevy',
      'foreignTaxCredit',
    ] as const) {
      const value = input[key];
      if (value !== undefined) {
        options[key] = value > 0 ? value.toFixed(2) : '';
      }
    }
    state.options = options;

    const calc = calculateTaxes(state.positions, state.year, options);
    await emitArtifact(
      {
        kind: 'f1',
        id: artifactId(),
        year: state.year,
        positions: state.positions,
        options,
      },
      config,
    );

    const uah = toHryvnias;
    const f1 = calc.f1;
    return result({
      year: state.year,
      positions: state.positions.length,
      belowThreshold: f1.belowThreshold,
      f1: {
        row1_income: uah(f1.totalIncome),
        row1_costs: uah(f1.totalCosts),
        row1_result: uah(f1.totalResult),
        row2_previousYearsLoss: uah(f1.previousYearsLoss),
        row3_financialResult: uah(f1.financialResult),
        row3_1_profit: uah(f1.profit),
        row3_2_lossCarriedForward: uah(f1.loss),
        row4_pdfo: uah(f1.pdfo),
        row4_2_pdfoPayable: uah(f1.pdfoPayable),
        row5_militaryLevy: uah(f1.militaryLevy),
        row5_2_militaryLevyPayable: uah(f1.militaryLevyPayable),
        operations: f1.rows.length,
      },
      foreignIncome: {
        dividendsAndInterest: calc.dividends,
        pdfo: calc.pdfoFromDividends,
        militaryLevy: calc.militaryTaxFromDividends,
        foreignTaxCredit: calc.foreignTaxCredit,
      },
      totals: { pdfo: calc.pdfo, militaryLevy: calc.militaryTax, total: calc.total },
      exchangeRateDifference: { profit: calc.fxDifference, tax: calc.taxOnFx },
      notes: calculationNotes(calc, state.positions),
    });
  },
  {
    name: 'calculate_f1',
    description:
      'Compute annex Ф1 and the declaration totals for the current positions and show the Ф1 form with charts in the chat. Amounts of the optional inputs are in UAH; 0 clears one.',
    schema: z.object({
      year: z.number().int().optional(),
      previousYearsLoss: z.number().nonnegative().optional(),
      withheldPdfo: z.number().nonnegative().optional(),
      withheldMilitaryLevy: z.number().nonnegative().optional(),
      foreignTaxCredit: z
        .number()
        .nonnegative()
        .optional()
        .describe('Only with a legalised certificate of the foreign tax authority.'),
    }),
  },
);

/** DejaVu fonts for Cyrillic PDFs, read from the public folder (dev) or the build output. */
export const diskFonts: FontLoader = async () => {
  const candidates = [
    new URL('../browser/fonts/', import.meta.url),
    new URL(`file://${process.cwd()}/public/fonts/`),
    new URL(`file://${process.cwd()}/dist/Taxered/browser/fonts/`),
  ];
  for (const dir of candidates) {
    try {
      const [normal, bold] = await Promise.all([
        readFile(new URL('DejaVuSans.ttf', dir)),
        readFile(new URL('DejaVuSans-Bold.ttf', dir)),
      ]);
      return { normal: toArrayBuffer(normal), bold: toArrayBuffer(bold) };
    } catch {
      // Try the next location.
    }
  }
  return null;
};

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

const exportF1Documents = tool(
  async (input, config) => {
    const session = sessionOf(config);
    const state = session.f1;
    if (!state || state.positions.length === 0) {
      throw new Error('Спочатку імпортуйте позиції й розрахуйте Ф1.');
    }
    const anonymous = input.anonymous ?? false;
    const fullName = anonymous ? 'Не вказано' : (input.fullName?.trim() ?? '');
    const taxNumber = anonymous ? 'Не вказано' : (input.taxNumber?.trim() ?? '');
    const calc = calculateTaxes(state.positions, state.year, state.options);
    const notes = calculationNotes(calc, state.positions);
    const made: string[] = [];
    const problems: string[] = [];

    if ((input.formats.includes('pdf') || input.formats.includes('xlsx')) && !anonymous) {
      if (!fullName || !taxNumber) {
        problems.push('Для PDF/Excel потрібні ПІБ і податковий номер (або anonymous: true).');
      }
    }

    if (input.formats.includes('pdf') && problems.length === 0) {
      const pdf = await renderF0121214PDF(
        {
          fullName,
          taxNumber,
          year: state.year,
          notes: '',
          calculationNotes: notes,
          positions: state.positions,
          calculations: calc,
        },
        diskFonts,
      );
      await emitFile(
        config,
        pdf.filename,
        'application/pdf',
        pdf.bytes,
        'Розрахунок Ф1 (PDF, з копією)',
      );
      made.push(pdf.filename);
    }

    if (input.formats.includes('xlsx') && problems.length === 0) {
      const xlsx = renderTaxCalculationExcel({
        fullName,
        taxNumber,
        year: state.year,
        positions: state.positions,
        calculations: calc,
        calculationNotes: notes,
      });
      await emitFile(
        config,
        xlsx.fileName,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xlsx.bytes,
        'Перевірка розрахунку (Excel)',
      );
      made.push(xlsx.fileName);
    }

    if (input.formats.includes('xml')) {
      if (anonymous) {
        problems.push('Пакет XML не можна сформувати анонімно.');
      } else {
        const t = input.taxpayer;
        const pkg = buildDeclarationPackage({
          year: state.year,
          taxpayer: {
            fullName,
            taxNumber,
            taxOfficeCode: t?.taxOfficeCode ?? '',
            taxOfficeName: t?.taxOfficeName ?? '',
            address: {
              region: t?.region,
              district: t?.district,
              city: t?.city ?? '',
              street: t?.street ?? '',
              building: t?.building,
              corpus: t?.corpus,
              apartment: t?.apartment,
              zip: t?.zip,
            },
            phone: t?.phone,
            email: t?.email,
          },
          positions: state.positions,
          options: state.options,
          meta: {
            kind: input.declarationKind ?? 'original',
            docNumber: input.docNumber,
            clarifiedRegNumber: input.clarifiedRegNumber,
          },
          fillDate: new Date(),
        });
        if (!pkg.ok) {
          problems.push(`XML: ${pkg.message}${pkg.field ? ` (поле ${pkg.field})` : ''}`);
        } else {
          for (const file of pkg.files) {
            await emitFile(
              config,
              file.name,
              'application/xml',
              file.bytes,
              file.kind === 'f1'
                ? 'Додаток Ф1 F0121215 для Електронного кабінету'
                : 'Декларація F0100215 для Електронного кабінету',
            );
            made.push(file.name);
          }
          problems.push(...pkg.warnings);
        }
      }
    }

    return result({
      files: made,
      problems,
      hint: 'XML files are uploaded together in the DPS e-cabinet («Введення звітності» → «Завантажити»), both before signing.',
    });
  },
  {
    name: 'export_f1_documents',
    description:
      'Generate result files of the current Ф1 calculation and show them in the chat for download: pdf (printable form with a copy), xlsx (check workbook), xml (DPS e-cabinet package F0100215 + F0121215).',
    schema: z.object({
      formats: z.array(z.enum(['pdf', 'xlsx', 'xml'])).min(1),
      anonymous: z.boolean().optional().describe('PDF/Excel without name and tax number.'),
      fullName: z.string().optional(),
      taxNumber: z.string().optional().describe('РНОКПП (10 digits) or passport/ID number.'),
      taxpayer: z
        .object({
          taxOfficeCode: z.string(),
          taxOfficeName: z.string(),
          region: z.string().optional(),
          district: z.string().optional(),
          city: z.string(),
          street: z.string(),
          building: z.string().optional(),
          corpus: z.string().optional(),
          apartment: z.string().optional(),
          zip: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().optional(),
        })
        .optional()
        .describe('Required for xml.'),
      declarationKind: z.enum(['original', 'new', 'clarifying']).optional(),
      docNumber: z.string().optional(),
      clarifiedRegNumber: z.string().optional(),
    }),
  },
);

export const f1Tools = [
  importBrokerReports,
  addManualPosition,
  removePositions,
  calculateF1,
  exportF1Documents,
];
