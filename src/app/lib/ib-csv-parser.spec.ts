import {
  RealizedAmount,
  ibCsvYearIncome,
  isIbCsvStatement,
  parseIbCsvStatement,
} from './ib-csv-parser';

const TRADES_HEADER =
  'Сделки,Header,DataDiscriminator,Класс актива,Валюта,Символ,Дата/Время,Количество,Цена транзакции,Цена закрытия,Выручка,Комиссия/плата,Базис,Реализованная П/У,Рыноч. переоценка П/У,Код';

function statement(
  period: string,
  rows: string[],
  { prior = [] as string[], dividends = [] as string[] } = {},
): string {
  return [
    '﻿Statement,Header,Название поля,Значение поля',
    `Statement,Data,Period,"${period}"`,
    'Информация о счете,Header,Название поля,Значение поля',
    'Информация о счете,Data,Счет,U1',
    'Изменение в NAV,Header,Название поля,Значение поля',
    'Изменение в NAV,Data,Начальная стоимость,1000',
    'Изменение в NAV,Data,Конечная стоимость,3600',
    'Изменение в NAV,Data,Внесение и вывод средств,"2,500.5"',
    'Рыночная переоценка: отчет об эффективности,Header,Класс актива,Символ,Предыд. Количество,Текущ. Количество',
    ...prior.map((p) => `Рыночная переоценка: отчет об эффективности,Data,Акции,${p}`),
    TRADES_HEADER,
    ...rows,
    'Дивиденды,Header,Валюта,Дата,Описание,Сумма',
    ...dividends.map((d) => `Дивиденды,Data,USD,${d}`),
    'Дивиденды,Data,Всего,,,12.5',
  ].join('\n');
}

const trade = (fields: string) => `Сделки,Data,Order,Акции,USD,${fields}`;

const STATEMENT_2024 = statement('Январь 1, 2024 - Декабрь 31, 2024', [
  trade('VTI,"2024-03-01, 10:00:00",10,100,100,-1000,-1,1001,0,0,O'),
  trade('VTI,"2024-06-01, 10:00:00",10,110,110,-1100,-1,1101,0,0,O'),
]);

const STATEMENT_2025 = statement(
  'Январь 1, 2025 - Декабрь 31, 2025',
  [
    trade('VTI,"2025-02-01, 10:00:00","-15",120,120,1800,-1,-1551.5,247.5,0,C'),
    'Сделки,SubTotal,,Акции,USD,VTI,,-15,,,1800,-1,-1551.5,247.5,0,',
    'Сделки,Data,Order,Опционы на акции и индексы,USD,VTI 21MAR25 130 C,"2025-03-01, 10:00:00",-1,1,1,100,-1,-99,0,0,O',
    'Сделки,Data,Order,Опционы на акции и индексы,USD,VTI 21MAR25 130 C,"2025-03-10, 10:00:00",1,0.3,0.3,-30,-1,99,68,0,C',
    'Сделки,Data,Order,Облигации,USD,T 1 3/8 08/15/50 4.9%,"2025-04-01, 10:00:00","2,000",50,50,-1000,-5,1005,0,0,O',
    'Сделки,Data,Order,Облигации,USD,T 1 3/8 08/15/50 4.7%,"2025-05-01, 10:00:00","-2,000",52,52,1040,-5,-1005,30,0,C',
  ],
  {
    prior: ['VTI,20,0'],
    dividends: ['2025-03-31,VTI(US9229087690) Наличный дивиденд USD 1 на акцию,12.5'],
  },
);

const net = (amounts: RealizedAmount[]) =>
  amounts.reduce((sum, a) => sum + a.sale - a.expenses - a.purchase, 0);

describe('ib-csv-parser', () => {
  it('recognizes an activity statement', () => {
    expect(isIbCsvStatement(STATEMENT_2025)).toBe(true);
    expect(isIbCsvStatement('<FlexQueryResponse>')).toBe(false);
  });

  it('reads an English statement period and account values', () => {
    const parsed = parseIbCsvStatement(
      [
        'Statement,Header,Field Name,Field Value',
        'Statement,Data,Period,"March 5, 2026 - October 5, 2026"',
        'Change in NAV,Header,Field Name,Field Value',
        'Change in NAV,Data,Starting Value,250.75',
        'Change in NAV,Data,Deposits & Withdrawals,-100',
      ].join('\r\n'),
    );
    expect([parsed.start, parsed.end]).toEqual(['2026-03-05', '2026-10-05']);
    expect(parsed.startingValue).toBe(250.75);
    expect(parsed.deposits).toBe(-100);
  });

  it('reads trades, dividends and the starting positions', () => {
    const parsed = parseIbCsvStatement(STATEMENT_2025);
    expect(parsed.account).toBe('U1');
    expect(parsed.period).toBe('Январь 1, 2025 - Декабрь 31, 2025');
    expect(parsed.start).toBe('2025-01-01');
    expect(parsed.end).toBe('2025-12-31');
    expect(parsed.startingValue).toBe(1000);
    expect(parsed.endingValue).toBe(3600);
    expect(parsed.deposits).toBe(2500.5);
    expect(parsed.trades.length).toBe(5);
    expect(parsed.trades[3].quantity).toBe(2000);
    expect(parsed.trades[3].position).toBe(parsed.trades[4].position);
    expect(parsed.dividends).toEqual([{ date: '2025-03-31', currency: 'USD', amount: 12.5 }]);
    expect(parsed.priorPositions).toEqual([{ position: 'U1|VTI', quantity: 20 }]);
  });

  it('takes purchase dates from earlier statements (FIFO) and keeps the reported profit', () => {
    const s2024 = parseIbCsvStatement(STATEMENT_2024);
    const s2025 = parseIbCsvStatement(STATEMENT_2025);
    const income = ibCsvYearIncome(s2025, [s2024, s2025], 2025);

    expect(income.trades).toBe(3);
    expect(income.dividends).toBe(1);
    expect(income.unmatched).toBe(0);

    const vti = income.amounts.filter((a) => a.kind === 'trade' && a.saleDate === '2025-02-01');
    expect(vti.map((a) => a.purchaseDate)).toEqual(['2024-03-01', '2024-06-01']);
    expect(vti[0].sale).toBeCloseTo(1200);
    expect(net(vti)).toBeCloseTo(247.5);

    const trades = income.amounts.filter((a) => a.kind === 'trade');
    expect(net(trades)).toBeCloseTo(247.5 + 68 + 30);
  });

  it('values a short position as sold when opened and bought back when closed', () => {
    const s2025 = parseIbCsvStatement(STATEMENT_2025);
    const option = ibCsvYearIncome(s2025, [s2025], 2025).amounts.find(
      (a) => a.purchaseDate === '2025-03-10',
    );
    expect(option).toEqual({
      kind: 'trade',
      currency: 'USD',
      purchaseDate: '2025-03-10',
      saleDate: '2025-03-01',
      purchase: 31,
      sale: 99,
      expenses: 0,
    });
  });

  it('marks lots held before the first statement as of unknown date', () => {
    const s2025 = parseIbCsvStatement(STATEMENT_2025);
    const income = ibCsvYearIncome(s2025, [s2025], 2025);
    expect(income.unmatched).toBe(1);
    const vti = income.amounts.filter((a) => a.saleDate === '2025-02-01');
    expect(vti.length).toBe(1);
    expect(vti[0].purchaseDate).toBe('');
    expect(net(vti)).toBeCloseTo(247.5);
  });

  it('counts a trade once when statements overlap', () => {
    const s2024 = parseIbCsvStatement(STATEMENT_2024);
    const copy = parseIbCsvStatement(STATEMENT_2024);
    const s2025 = parseIbCsvStatement(STATEMENT_2025);
    const income = ibCsvYearIncome(s2025, [s2024, copy, s2025], 2025);
    expect(income.unmatched).toBe(0);
    const vti = income.amounts.filter((a) => a.saleDate === '2025-02-01');
    expect(vti.map((a) => a.purchaseDate)).toEqual(['2024-03-01', '2024-06-01']);
  });

  it('leaves out other years', () => {
    const s2024 = parseIbCsvStatement(STATEMENT_2024);
    const income = ibCsvYearIncome(s2024, [s2024], 2025);
    expect(income.trades).toBe(0);
    expect(income.amounts.length).toBe(0);
  });
});
