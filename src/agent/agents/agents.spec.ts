import { randomUUID } from 'node:crypto';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { ChatArtifact } from '../../app/chat/protocol';
import { validateAgainstXsd } from '../../app/lib/dps-xml/testing/xsd';
import { ARTIFACT_EVENT } from '../context';
import { Session, uploadFile } from '../session';
import { MemoryThreadStore } from '../store/thread-store';
import { IB_CSV, IB_XML, LEDGER_CSV } from '../testing/fixtures';
import { nbuFetch } from '../testing/scripted-model';
import { f1Tools } from './f1';
import { ledgerTools } from './ledger';
import { returnsTools } from './returns';
import { spreadsTools } from './spreads';
import { findCountries, taxMapTools } from './tax-map';

/**
 * Uploads `files` to a new thread and runs tools as a sub-agent would, collecting the
 * artifacts they show.
 */
async function runner(files: [name: string, content: string][] = []) {
  const store = new MemoryThreadStore();
  const threadId = randomUUID();
  const uploaded = [];
  for (const [name, content] of files) {
    uploaded.push(await uploadFile(store, threadId, name, content));
  }
  const session = await Session.open(store, threadId);
  const artifacts: ChatArtifact[] = [];
  const config: RunnableConfig = {
    configurable: { thread_id: threadId, session },
    callbacks: [
      {
        handleCustomEvent(name: string, data: unknown) {
          if (name === ARTIFACT_EVENT) {
            artifacts.push(data as ChatArtifact);
          }
        },
      },
    ],
  };
  const run = async (tools: StructuredToolInterface[], name: string, args: object) => {
    const found = tools.find((t) => t.name === name);
    if (!found) {
      throw new Error(`No tool ${name}`);
    }
    return JSON.parse(String(await found.invoke(args, config))) as Record<string, any>;
  };
  /** Bytes of the generated files, in the order they were shown. */
  const outputs = async () =>
    Promise.all(
      artifacts
        .filter((a) => a.kind === 'file')
        .map(async (a) => (await store.getOutput(threadId, a.id))!),
    );
  return { artifacts, run, uploaded, outputs };
}

describe('sub-agent tools', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', nbuFetch({ USD: 41.5, EUR: 44 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Ф1: imports an IB report at NBU rates, calculates and exports PDF, Excel and a valid XML package', async () => {
    const { artifacts, run, uploaded, outputs } = await runner([['ib.xml', IB_XML]]);
    expect(uploaded[0].kind).toBe('ib_xml');

    const imported = await run(f1Tools, 'import_broker_reports', { year: 2025 });
    expect(imported).toMatchObject({ imported: 2, year: '2025', warnings: [] });

    const calc = await run(f1Tools, 'calculate_f1', {});
    // Sale 2000 × 41.5 = 83 000; cost 1501 × 41.5 = 62 291.50 plus the $1 sale commission 41.50.
    expect(calc['f1']).toMatchObject({
      row1_income: 83000,
      row1_costs: 62333,
      row1_result: 20667,
      row4_pdfo: 3720.06,
      row5_militaryLevy: 1033.35,
    });
    expect(calc['foreignIncome']['dividendsAndInterest']).toBe(4150);
    expect(artifacts).toEqual([
      expect.objectContaining({ kind: 'f1', year: '2025', positions: expect.any(Array) }),
    ]);

    const exported = await run(f1Tools, 'export_f1_documents', {
      formats: ['pdf', 'xlsx', 'xml'],
      fullName: 'Шевченко Тарас Григорович',
      taxNumber: '1234567890',
      taxpayer: {
        taxOfficeCode: '2650',
        taxOfficeName: 'ГУ ДПС у м. Києві',
        city: 'Київ',
        street: 'Хрещатик',
        building: '1',
      },
    });
    expect(exported['problems']).toEqual([]);
    const files = artifacts.filter((a) => a.kind === 'file');
    expect(files.map((f) => f.mime)).toEqual([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/xml',
      'application/xml',
    ]);

    const generated = await outputs();
    const pdf = generated.find((o) => o.meta.mime === 'application/pdf')!;
    expect(new TextDecoder().decode(pdf.bytes.subarray(0, 5))).toBe('%PDF-');
    for (const xml of generated.filter((o) => o.meta.mime === 'application/xml')) {
      const text = new TextDecoder('windows-1251').decode(xml.bytes);
      expect(validateAgainstXsd({ name: xml.meta.name, xml: text, bytes: xml.bytes })).toEqual({
        valid: true,
        errors: '',
      });
    }
  });

  it('Ф1: asks for the taxpayer details the XML package needs instead of inventing them', async () => {
    const { run } = await runner([['ib.xml', IB_XML]]);
    await run(f1Tools, 'import_broker_reports', { year: 2025 });
    const exported = await run(f1Tools, 'export_f1_documents', {
      formats: ['xml'],
      fullName: 'Шевченко Тарас Григорович',
      taxNumber: '1234567890',
    });
    expect(exported['files']).toEqual([]);
    expect(exported['problems'][0]).toMatch(/^XML: /);
  });

  it('Ф1: adds a position described in words at NBU rates', async () => {
    const { run } = await runner();
    const added = await run(f1Tools, 'add_manual_position', {
      year: 2025,
      assetType: 'crypto',
      currency: 'USD',
      purchaseDate: '2025-01-10',
      saleDate: '2025-05-10',
      purchaseAmount: 100,
      saleAmount: 300,
    });
    expect(added['added']).toMatchObject({ purchaseUah: '4150.00', saleUah: '12450.00' });
  });

  it('returns: analyses an IB CSV statement and shows the year', async () => {
    const { artifacts, run } = await runner([['ib-2025.csv', IB_CSV]]);
    const analysis = await run(returnsTools, 'analyze_returns', { currency: 'USD' });
    expect(analysis['years']).toEqual([
      expect.objectContaining({ year: 2025, trades: 298, dividends: 20 }),
    ]);
    expect(analysis['initialCapital']).toBe(10000);
    expect(artifacts[0]).toMatchObject({ kind: 'returns', currency: 'USD', initialCapital: 10000 });

    await run(returnsTools, 'export_returns_table', {});
    expect(artifacts.at(-1)).toMatchObject({
      kind: 'file',
      name: expect.stringMatching(/\.xlsx$/),
    });
  });

  it('tax map: finds countries by code or name and compares income after tax', async () => {
    expect(findCountries(['ua', 'Польща', 'Атлантида'])).toMatchObject({
      found: [{ code: 'UA' }, { code: 'PL' }],
      missing: ['Атлантида'],
    });
    const { artifacts, run } = await runner();
    const compared = await run(taxMapTools, 'compare_net_income', {
      amount: 1000,
      currency: 'USD',
      metric: 'dividends',
      countries: ['UA', 'AE'],
    });
    expect(compared['rows'][0]).toMatchObject({ code: 'AE', tax: 0, net: 1000 });
    expect(artifacts[0]).toMatchObject({ kind: 'chart', chart: 'bar', unit: 'money' });

    await run(taxMapTools, 'show_tax_map', {
      metric: 'capitalGains',
      region: 'europe',
      highlight: ['UA', 'PL'],
    });
    expect(artifacts[1]).toMatchObject({
      kind: 'tax-map',
      view: 'europe',
      highlight: ['UA', 'PL'],
    });
  });

  it('spreads and portfolio: read a Ledger Live CSV', async () => {
    const { artifacts, run } = await runner([['ledger.csv', LEDGER_CSV]]);

    const spreads = await run(spreadsTools, 'analyze_spreads_and_fees', {});
    // The OUT amount includes the 0.001 ETH network fee: 0.499 ETH given at 3000.
    expect(spreads['swaps']).toMatchObject({ swaps: 1, given: 1497, received: 1450, spread: 47 });
    expect(artifacts[0]).toMatchObject({ kind: 'spreads', fileName: 'ledger.csv' });

    const portfolio = await run(ledgerTools, 'analyze_portfolio', {});
    expect(portfolio['holdings'].map((h: { ticker: string }) => h.ticker).sort()).toEqual([
      'ETH',
      'USDC',
    ]);
    expect(artifacts[1]).toMatchObject({ kind: 'ledger', operations: expect.any(Array) });
  });

  it('tells the model which format is needed when the files do not fit', async () => {
    const { run } = await runner([['ledger.csv', LEDGER_CSV]]);
    await expect(run(f1Tools, 'import_broker_reports', { year: 2025 })).rejects.toThrow(
      /немає файлів потрібного формату/,
    );
  });
});
