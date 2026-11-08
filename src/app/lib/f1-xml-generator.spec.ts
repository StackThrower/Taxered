import type { FinancialPosition } from '../declaration/f0121214/tax-model';
import { buildF1Xml, encodeWindows1251 } from './f1-xml-generator';

const position = (overrides: Partial<FinancialPosition>): FinancialPosition => ({
  id: 'p',
  assetType: 'stocks',
  currency: 'USD',
  purchaseDate: '2025-01-10',
  saleDate: '2025-06-20',
  purchasePriceForeign: '',
  salePriceForeign: '',
  purchaseRate: '1',
  saleRate: '1',
  purchasePrice: '0',
  salePrice: '0',
  expenses: '',
  ...overrides,
});

const base = {
  fullName: 'Іваненко Іван Іванович',
  taxNumber: '1234567890',
  taxOfficeCode: '2650',
  year: '2025',
  fillDate: new Date(2026, 2, 15),
};

function build(positions: FinancialPosition[], overrides: Partial<typeof base> = {}) {
  const result = buildF1Xml({ ...base, ...overrides, positions });
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result;
}

describe('buildF1Xml', () => {
  it('writes the F0121215 header and a DPS-style file name', () => {
    const { xml, fileName } = build([position({ purchasePrice: '1000', salePrice: '1500' })]);

    expect(xml).toContain('<C_DOC>F01</C_DOC>');
    expect(xml).toContain('<C_DOC_SUB>212</C_DOC_SUB>');
    expect(xml).toContain('<C_DOC_VER>15</C_DOC_VER>');
    expect(xml).toContain('<C_REG>26</C_REG>');
    expect(xml).toContain('<C_RAJ>50</C_RAJ>');
    expect(xml).toContain('<C_STI_ORIG>2650</C_STI_ORIG>');
    expect(xml).toContain('<PERIOD_YEAR>2025</PERIOD_YEAR>');
    expect(xml).toContain('<D_FILL>15032026</D_FILL>');
    expect(fileName).toBe('26501234567890F0121215100000000151220252650.xml');
  });

  it('lists every trade and totals rows 1, 3, 3.1, 4 and 5', () => {
    const { xml, rows } = build([
      position({ purchasePrice: '10000', salePrice: '15000', expenses: '500', symbol: 'AAPL' }),
      position({ purchasePrice: '2000', salePrice: '1000.55' }),
    ]);

    expect(rows.map((r) => r.result)).toEqual([450000, -99945]);
    expect(xml).toContain('<T1RXXXXG2 ROWNUM="1">4</T1RXXXXG2>');
    expect(xml).toContain('<T1RXXXXG5 ROWNUM="1">10500.00</T1RXXXXG5>');
    expect(xml).toContain('<T1RXXXXG6 ROWNUM="2">-999.45</T1RXXXXG6>');
    expect(xml).toContain('<R001G4>16000.55</R001G4>');
    expect(xml).toContain('<R001G5>12500.00</R001G5>');
    expect(xml).toContain('<R001G6>3500.55</R001G6>');
    expect(xml).toContain('<R031G6>3500.55</R031G6>');
    expect(xml).toContain('<R004G6>630.10</R004G6>');
    expect(xml).toContain('<R042G6>630.10</R042G6>');
    expect(xml).toContain('<R005G6>175.03</R005G6>');
    expect(xml).not.toContain('R032G6');
  });

  it('reports a net loss in row 3.2 without tax rows', () => {
    const { xml } = build([position({ purchasePrice: '1000', salePrice: '400' })]);

    expect(xml).toContain('<R003G6>-600.00</R003G6>');
    expect(xml).toContain('<R032G6>600.00</R032G6>');
    expect(xml).not.toContain('R004G6');
  });

  it('leaves out dividends and real estate', () => {
    const result = build([
      position({ salePrice: '100' }),
      position({ assetType: 'dividends', salePrice: '50' }),
      position({ assetType: 'real_estate', salePrice: '900000' }),
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.skipped).toBe(2);
  });

  it('uses code 2 for hryvnia trades on a domestic exchange', () => {
    const { rows } = build([position({ currency: 'UAH', salePrice: '100' })]);
    expect(rows[0].code).toBe(2);
  });

  it('rejects input the e-cabinet would refuse', () => {
    const trade = [position({ salePrice: '100' })];
    expect(buildF1Xml({ ...base, taxNumber: '123', positions: trade })).toMatchObject({
      ok: false,
      field: 'taxNumber',
    });
    expect(buildF1Xml({ ...base, taxOfficeCode: '', positions: trade })).toMatchObject({
      ok: false,
      field: 'taxOfficeCode',
    });
    expect(buildF1Xml({ ...base, positions: [] })).toMatchObject({ ok: false });
  });

  it('escapes XML special characters in descriptions', () => {
    const { xml } = build([position({ salePrice: '1', assetDescription: 'AT&T <Inc>' })]);
    expect(xml).toContain('AT&amp;T &lt;Inc&gt;');
  });
});

describe('encodeWindows1251', () => {
  it('maps Ukrainian letters to windows-1251 bytes', () => {
    expect([...encodeWindows1251('Aґєії№')]).toEqual([0x41, 0xb4, 0xba, 0xb3, 0xbf, 0xb9]);
  });

  it('replaces characters outside the code page', () => {
    expect([...encodeWindows1251('€✓')]).toEqual([0x88, 0x3f]);
  });
});
