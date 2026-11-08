import { buildFileName } from './filename';

const parts = {
  taxOffice: '2650',
  tin: '1234567890',
  cDoc: 'F01',
  cDocSub: '212',
  cDocVer: '15',
  cDocStan: 1,
  cDocType: 0,
  cDocCnt: 1,
  periodType: 5,
  periodMonth: 12,
  year: 2025,
};

/** DGFilename from common_types.xsd. */
const DG_FILENAME =
  /^([0-9]){4}(([0-9]{10})|(00[АБВГДЕЄЖЗИІКЛМНОПРСТУФХЦЧШЩЮЯ]{2}[0-9]{6}))([JF]((0[1-9])|([1-9][0-9])))(([0-9]{2}[1-9])|([0-9][1-9][0-9])|([1-9][0-9]{2}))(([1-9][0-9])|(0[1-9]))[1-3]([0-9]{2})([0-9]{7})([1-5])((0[1-9])|(1[0-2]))(20[0-9]{2})([0-9]){4}\.[xX][mM][lL]$/;

describe('buildFileName', () => {
  it('matches the examples of the spec', () => {
    expect(buildFileName(parts)).toBe('26501234567890F0121215100000000151220252650.xml');
    expect(buildFileName({ ...parts, cDocSub: '002' })).toBe(
      '26501234567890F0100215100000000151220252650.xml',
    );
    expect(buildFileName({ ...parts, cDocStan: 3, cDocType: 1 })).toBe(
      '26501234567890F0121215301000000151220252650.xml',
    );
  });

  it('pads 9-digit ID-card numbers and prefixes passports with 00', () => {
    const idCard = buildFileName({ ...parts, tin: '123456789' });
    const passport = buildFileName({ ...parts, tin: 'КВ123456' });

    expect(idCard.slice(4, 14)).toBe('0123456789');
    expect(passport.slice(4, 14)).toBe('00КВ123456');
    expect(idCard).toMatch(DG_FILENAME);
    expect(passport).toMatch(DG_FILENAME);
  });

  it('pads three-digit tax office codes', () => {
    const name = buildFileName({ ...parts, taxOffice: '265' });
    expect(name.startsWith('0265')).toBe(true);
    expect(name).toMatch(DG_FILENAME);
  });
});
