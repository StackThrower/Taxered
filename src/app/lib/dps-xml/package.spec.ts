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
    taxOfficeName: 'ГУ ДПС у м. Києві',
    address: { city: 'Київ', street: 'Хрещатик', building: '1', apartment: '2', zip: '01001' },
    phone: '+380 44 000 00 00',
    email: 'ivan@example.com',
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
    const file = f1File([position({ purchasePrice: '10000', salePrice: '15000' })]);

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
    const { xml } = f1File([position({ salePrice: '10000' })]);
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
    const file = f1File([position({ purchasePrice: '16000', salePrice: '10000' })]);

    expect(file.xml).toContain('<R003G6>-6000.00</R003G6>');
    expect(file.xml).toContain('<R032G6>6000.00</R032G6>');
    expect(file.xml).not.toContain('R004G6');
    expect(file.xml).not.toContain('R005G6');
    expectValid(file);
  });

  it('writes rows 2, 4.1 and 5.1 in schema order', () => {
    const file = f1File([position({ purchasePrice: '10000', salePrice: '30000' })], {
      options: { previousYearsLoss: '5000', withheldPdfo: '100', withheldMilitaryLevy: '50' },
    });

    expect(file.xml).toContain('<R002G6>5000.00</R002G6><R003G6>15000.00</R003G6>');
    expect(file.xml).toContain('<R041G6>100.00</R041G6>');
    expect(file.xml).toContain('<R051G6>50.00</R051G6>');
    expectValid(file);
  });

  it('forms no Ф1 within the pp. "а" 170.2.8 threshold', () => {
    const result = buildDeclarationPackage({
      ...base,
      positions: [position({ purchasePrice: '1000', salePrice: '4240' })],
    });
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? '' : result.message).toContain('170.2.8');
  });

  it('leaves out dividends and real estate', () => {
    const { f1 } = build([
      position({ salePrice: '10000' }),
      position({ assetType: 'dividends', salePrice: '50' }),
      position({ assetType: 'real_estate', salePrice: '900000' }),
    ]);

    expect(f1?.rows).toHaveLength(1);
    expect(f1?.skipped).toBe(2);
  });

  it('uses code 2 for hryvnia trades on a domestic exchange', () => {
    const { f1 } = build([position({ currency: 'UAH', salePrice: '10000' })]);
    expect(f1?.rows[0].code).toBe(2);
  });

  it('picks the form version by income year', () => {
    const v14 = f1File([position({ salePrice: '10000' })], { year: '2024' });
    const v13 = f1File([position({ salePrice: '10000' })], { year: '2022' });

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
    const trade = [position({ salePrice: '10000' })];
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
      const file = f1File([position({ salePrice: '10000' })], {
        taxpayer: { ...base.taxpayer, taxNumber },
      });
      expectValid(file);
    }
  });

  it('escapes XML special characters and warns about characters outside windows-1251', () => {
    const result = build([position({ salePrice: '10000', assetDescription: 'AT&T <Inc> "€✓"' })]);
    const file = result.files.find((f) => f.kind === 'f1')!;

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

describe('buildDeclarationPackage: declaration F0100215', () => {
  const reference = [
    position({
      symbol: 'AAPL',
      purchasePrice: '63000.00',
      salePrice: '83000.00',
      expenses: '83.50',
    }),
    position({
      symbol: 'MSFT',
      purchasePrice: '86520.00',
      salePrice: '79610.00',
      expenses: '83.10',
    }),
    position({
      assetType: 'dividends',
      symbol: 'AAPL',
      isin: 'US0378331005',
      purchaseDate: '',
      saleDate: '2025-03-15',
      salePriceForeign: '100.00',
      saleRate: '41.8000',
      salePrice: '4180.00',
    }),
  ];

  it('builds the reference package of the spec to the kopeck', () => {
    const result = build(reference, { options: { previousYearsLoss: '3000.00' } });
    const declaration = result.files.find((f) => f.kind === 'declaration')!;
    const f1 = result.files.find((f) => f.kind === 'f1')!;

    expect(declaration.name).toBe('26501234567890F0100215100000000151220252650.xml');
    expect(f1.name).toBe('26501234567890F0121215100000000151220252650.xml');
    expectValid(declaration);
    expectValid(f1);

    expect(f1.xml).toContain(
      '<R001G4>162610.00</R001G4><R001G5>149686.60</R001G5><R001G6>12923.40</R001G6>',
    );
    expect(f1.xml).toContain(
      '<R002G6>3000.00</R002G6><R003G6>9923.40</R003G6><R031G6>9923.40</R031G6>',
    );
    expect(f1.xml).toContain('<R004G6>1786.21</R004G6><R042G6>1786.21</R042G6>');
    expect(f1.xml).toContain('<R005G6>496.17</R005G6><R052G6>496.17</R052G6>');

    const x = declaration.xml;
    expect(x).toContain('<R010G3>14103.40</R010G3><R010G6>2162.41</R010G6><R010G7>705.17</R010G7>');
    expect(x).toContain(
      '<R0108G3>9923.40</R0108G3><R0108G6>1786.21</R0108G6><R0108G7>496.17</R0108G7>',
    );
    expect(x).toContain(
      '<R01010G2S>США; долар США</R01010G2S><R01010G3>4180.00</R01010G3><R01010G6>376.20</R01010G6><R01010G7>209.00</R01010G7>',
    );
    expect(x).toContain('<R012G3>14103.40</R012G3><R013G3>2162.41</R013G3>');
    expect(x).not.toContain('R018G3');
    expect(x).toContain('<R0201G3>2162.41</R0201G3><R0211G3>705.17</R0211G3>');
    expect(x).toContain('<HD1>1</HD1><HFILL>15032026</HFILL><HBOS>Іваненко Іван Іванович</HBOS>');
    expect(x).toContain('<HSTI>ГУ ДПС у м. Києві</HSTI><H01>1</H01><H03>1</H03><H05>1</H05>');
  });

  it('links the declaration and Ф1 to each other by file name', () => {
    const { files } = build(reference);
    const [declaration, f1] = files;
    const link = (xml: string) =>
      /<LINKED_DOCS><DOC NUM="1" TYPE="(\d)">.*<FILENAME>([^<]+)<\/FILENAME><\/DOC><\/LINKED_DOCS>/.exec(
        xml,
      );

    expect(link(declaration.xml)?.slice(1)).toEqual(['1', f1.name]);
    expect(link(f1.xml)?.slice(1)).toEqual(['2', declaration.name]);
    expect(declaration.xml).toContain('<C_DOC_STAN>1</C_DOC_STAN><LINKED_DOCS>');
    expect(declaration.xml).toContain('</LINKED_DOCS><D_FILL>');
  });

  it('builds only the declaration, without LINKED_DOCS, for dividends alone', () => {
    const result = build([reference[2]]);

    expect(result.files.map((f) => f.kind)).toEqual(['declaration']);
    expect(result.files[0].xml).not.toContain('LINKED_DOCS');
    expect(result.files[0].xml).not.toContain('HD1');
    expectValid(result.files[0]);
  });

  it('files the declaration with dividends when trades stay within the threshold', () => {
    const result = build([position({ purchasePrice: '100', salePrice: '4000' }), reference[2]]);

    expect(result.files.map((f) => f.kind)).toEqual(['declaration']);
    expect(result.warnings.join()).toContain('170.2.8');
  });

  it('taxes interest and coupons at 18% and credits foreign tax only up to row 13', () => {
    const result = build(
      [
        position({
          assetType: 'interest',
          country: 'Ірландія',
          currency: 'EUR',
          salePrice: '1000.00',
        }),
        reference[2],
      ],
      { options: { foreignTaxCredit: '10000' } },
    );
    const x = result.files[0].xml;

    // 4180 × 9% + 1000 × 18% = 376.20 + 180.00.
    expect(x).toContain('<R01010G2S>Ірландія, США; євро, долар США</R01010G2S>');
    expect(x).toContain('<R01010G6>556.20</R01010G6>');
    expect(x).toContain('<R013G3>556.20</R013G3><R018G3>556.20</R018G3><R0211G3>259.00</R0211G3>');
    expect(x).not.toContain('R0201G3');
    expect(result.warnings.join()).toContain('рядка 13');
    expectValid(result.files[0]);
  });

  it('reports investment loss in Ф1 with an empty income section', () => {
    const result = build([position({ purchasePrice: '20000', salePrice: '10000' })]);
    const [declaration, f1] = result.files;

    expect(f1.xml).toContain('<R032G6>10000.00</R032G6>');
    expect(declaration.xml).not.toContain('R0108');
    expect(declaration.xml).toContain('<HD1>1</HD1>');
    expectValid(declaration);
    expectValid(f1);
  });

  it('requires the address and tax office name of the declaration header', () => {
    const missing = (patch: Partial<PackageInput['taxpayer']>) =>
      buildDeclarationPackage({
        ...base,
        taxpayer: { ...base.taxpayer, ...patch },
        positions: reference,
      });

    expect(missing({ taxOfficeName: ' ' })).toMatchObject({ ok: false, field: 'taxOfficeName' });
    expect(missing({ address: { city: '', street: 'x' } })).toMatchObject({
      ok: false,
      field: 'city',
    });
    expect(missing({ address: { city: 'x', street: 'y', zip: '123' } })).toMatchObject({
      ok: false,
      field: 'zip',
    });
  });

  it('validates against older schema versions too', () => {
    for (const year of ['2022', '2023', '2024']) {
      for (const file of build(reference, { year }).files) {
        expectValid(file);
      }
    }
  });
});
