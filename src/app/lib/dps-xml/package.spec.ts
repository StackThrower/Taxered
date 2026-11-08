import type { FinancialPosition } from '../../declaration/f0121214/tax-model';
import { encodeWindows1251 } from './encoding';
import { buildDeclarationPackage, type PackageInput } from './package';
import { expectValid } from './testing/xsd';

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

const base: Omit<PackageInput, 'positions'> = {
  year: '2025',
  taxpayer: {
    fullName: 'Іваненко Іван Іванович',
    taxNumber: '1234567890',
    taxOfficeCode: '2650',
  },
  fillDate: new Date(2026, 2, 15),
};

function build(positions: FinancialPosition[], overrides: Partial<PackageInput> = {}) {
  const result = buildDeclarationPackage({ ...base, ...overrides, positions });
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result;
}

function f1File(positions: FinancialPosition[], overrides: Partial<PackageInput> = {}) {
  const file = build(positions, overrides).files.find((f) => f.kind === 'f1');
  if (!file) {
    throw new Error('no Ф1 in the package');
  }
  return file;
}

describe('buildDeclarationPackage: Ф1', () => {
  it('writes the F0121215 header and a DPS-style file name', () => {
    const file = f1File([position({ purchasePrice: '1000', salePrice: '1500' })]);

    expect(file.xml).toContain('<C_DOC>F01</C_DOC>');
    expect(file.xml).toContain('<C_DOC_SUB>212</C_DOC_SUB>');
    expect(file.xml).toContain('<C_DOC_VER>15</C_DOC_VER>');
    expect(file.xml).toContain('<C_REG>26</C_REG>');
    expect(file.xml).toContain('<C_RAJ>50</C_RAJ>');
    expect(file.xml).toContain('<C_STI_ORIG>2650</C_STI_ORIG>');
    expect(file.xml).toContain('<PERIOD_YEAR>2025</PERIOD_YEAR>');
    expect(file.xml).toContain('<D_FILL>15032026</D_FILL>');
    expect(file.name).toBe('26501234567890F0121215100000000151220252650.xml');
    expectValid(file);
  });

  it('puts no whitespace between elements', () => {
    const { xml } = f1File([position({ salePrice: '1' })]);
    expect(xml).not.toMatch(/>\s+</);
    expect(xml.startsWith('<?xml version="1.0" encoding="windows-1251"?><DECLAR ')).toBe(true);
  });

  it('lists every trade and totals rows 1, 3, 3.1, 4 and 5', () => {
    const file = f1File([
      position({ purchasePrice: '10000', salePrice: '15000', expenses: '500', symbol: 'AAPL' }),
      position({ purchasePrice: '2000', salePrice: '1000.55' }),
    ]);

    expect(file.xml).toContain('<T1RXXXXG2 ROWNUM="1">4</T1RXXXXG2>');
    expect(file.xml).toContain('<T1RXXXXG5 ROWNUM="1">10500.00</T1RXXXXG5>');
    expect(file.xml).toContain('<T1RXXXXG6 ROWNUM="2">-999.45</T1RXXXXG6>');
    expect(file.xml).toContain('<R001G4>16000.55</R001G4>');
    expect(file.xml).toContain('<R001G5>12500.00</R001G5>');
    expect(file.xml).toContain('<R001G6>3500.55</R001G6>');
    expect(file.xml).toContain('<R031G6>3500.55</R031G6>');
    expect(file.xml).toContain('<R004G6>630.10</R004G6>');
    expect(file.xml).toContain('<R042G6>630.10</R042G6>');
    expect(file.xml).toContain('<R005G6>175.03</R005G6>');
    expect(file.xml).not.toContain('R032G6');
    expectValid(file);
  });

  it('reports a net loss in row 3.2 without tax rows', () => {
    const file = f1File([position({ purchasePrice: '1000', salePrice: '400' })]);

    expect(file.xml).toContain('<R003G6>-600.00</R003G6>');
    expect(file.xml).toContain('<R032G6>600.00</R032G6>');
    expect(file.xml).not.toContain('R004G6');
    expect(file.xml).not.toContain('R005G6');
    expectValid(file);
  });

  it('leaves out dividends and real estate', () => {
    const { f1 } = build([
      position({ salePrice: '100' }),
      position({ assetType: 'dividends', salePrice: '50' }),
      position({ assetType: 'real_estate', salePrice: '900000' }),
    ]);

    expect(f1?.rows).toHaveLength(1);
    expect(f1?.skipped).toBe(2);
  });

  it('uses code 2 for hryvnia trades on a domestic exchange', () => {
    const { f1 } = build([position({ currency: 'UAH', salePrice: '100' })]);
    expect(f1?.rows[0].code).toBe(2);
  });

  it('picks the form version by income year', () => {
    const v14 = f1File([position({ salePrice: '100' })], { year: '2024' });
    const v13 = f1File([position({ salePrice: '100' })], { year: '2022' });

    expect(v14.name).toContain('F0121214');
    expect(v14.xml).toContain('noNamespaceSchemaLocation="F0121214.xsd"');
    expect(v13.name).toContain('F0121213');
    expectValid(v14);
    expectValid(v13);
    expect(buildDeclarationPackage({ ...base, year: '2021', positions: [] })).toMatchObject({
      ok: false,
    });
  });

  it('rejects input the e-cabinet would refuse', () => {
    const trade = [position({ salePrice: '100' })];
    const taxpayer = base.taxpayer;
    expect(
      buildDeclarationPackage({
        ...base,
        taxpayer: { ...taxpayer, taxNumber: '123' },
        positions: trade,
      }),
    ).toMatchObject({ ok: false, field: 'taxNumber' });
    expect(
      buildDeclarationPackage({
        ...base,
        taxpayer: { ...taxpayer, taxOfficeCode: '' },
        positions: trade,
      }),
    ).toMatchObject({ ok: false, field: 'taxOfficeCode' });
    expect(buildDeclarationPackage({ ...base, positions: [] })).toMatchObject({ ok: false });
  });

  it('accepts a passport or an ID-card number instead of the RNOKPP', () => {
    for (const taxNumber of ['кв 123456', '123456789']) {
      const file = f1File([position({ salePrice: '100' })], {
        taxpayer: { ...base.taxpayer, taxNumber },
      });
      expectValid(file);
    }
  });

  it('escapes XML special characters and warns about characters outside windows-1251', () => {
    const result = build([position({ salePrice: '1', assetDescription: 'AT&T <Inc> "€✓"' })]);
    const file = result.files[0];

    expect(file.xml).toContain('AT&amp;T &lt;Inc&gt; &quot;€✓&quot;');
    expect(result.warnings.join()).toContain('«✓»');
    expectValid(file);
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
