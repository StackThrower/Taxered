import { detectFreedomEntity, parseAnyBrokerXML } from './ib-xml-parser';
import { applyNbuRates, type RateSource } from './position-rates';

const ibReport = (trades: string) => `<?xml version="1.0"?>
<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1" fromDate="20250101" toDate="20251231" period="Year">
<Trades>${trades}</Trades>
<CashTransactions>
  <CashTransaction type="Dividends" symbol="AAPL" isin="US0378331005" amount="100" currency="USD" dateTime="20250315;202000" description="AAPL CASH DIVIDEND" />
</CashTransactions>
</FlexStatement></FlexStatements></FlexQueryResponse>`;

const aaplSale = `<Trade tradeID="77" symbol="AAPL" assetCategory="STK" currency="USD" quantity="-10" tradePrice="200" proceeds="2000" ibCommission="-1" ibCommissionCurrency="USD" tradeDate="20250620" settleDateTarget="20250623" openCloseIndicator="C" />`;
const aaplLot = `<Lot tradeID="77" symbol="AAPL" isin="US0378331005" description="APPLE INC" assetCategory="STK" currency="USD" quantity="10" tradePrice="150" cost="1501" fifoPnlRealized="498" tradeDate="20250620" openDateTime="20250110;093000" openCloseIndicator="C" multiplier="1" />`;

const ffReport = (extra: string, trades: string) => `<?xml version="1.0"?>
<root><plainAccountInfoData><client_name>Test</client_name>${extra}<base_currency>USD</base_currency></plainAccountInfoData>
<trades><detailed>${trades}</detailed></trades></root>`;

const ffTrade = (
  op: 'buy' | 'sell',
  date: string,
  price: number,
  commission: number,
  currency = 'USD',
) =>
  `<node><trade_id>${op}${date}</trade_id><date>${date} 10:00:00</date><short_date>${date}</short_date><instr_nm>MSFT.US</instr_nm><instr_kind>Акція</instr_kind><isin>US5949181045</isin><operation>${op}</operation><p>${price}</p><curr_c>USD</curr_c><q>5</q><summ>${price * 5}</summ><profit>0</profit><commission>${commission}</commission><commission_currency>${currency}</commission_currency></node>`;

/** Made-up NBU rates of the spec's reference example. */
const RATES: Record<string, number> = {
  '2025-01-10|USD': 42,
  '2025-06-20|USD': 41.5,
  '2025-02-03|USD': 41.2,
  '2025-09-15|USD': 41.9,
  '2025-02-03|EUR': 43,
  '2025-09-15|EUR': 44,
  '2025-03-15|USD': 41.8,
};
const mockNbu: RateSource = async (date, currency) => RATES[`${date}|${currency}`] ?? null;

describe('IB Flex parser', () => {
  it('takes gross proceeds and the sale commission of the closing trade', async () => {
    const { positions, warnings } = parseAnyBrokerXML(ibReport(aaplSale + aaplLot), 'ib.xml', 2025);
    const lot = positions.find((p) => p.assetType === 'stocks')!;

    expect(warnings).toEqual([]);
    expect(lot).toMatchObject({
      purchaseDate: '2025-01-10',
      saleDate: '2025-06-20',
      saleSettlementDate: '2025-06-23',
      purchasePriceForeign: '1501.00',
      salePriceForeign: '2000.00',
      saleCommissionForeign: '1.00',
      saleCommissionCurrency: 'USD',
      isin: 'US0378331005',
      brokerJurisdiction: 'foreign',
    });

    // Purchase cost incl. the $1 purchase commission at 42, gross sale at 41.5, sale commission at 41.5.
    const priced = await applyNbuRates(lot, mockNbu);
    expect(priced).toMatchObject({
      purchasePrice: '63042.00',
      salePrice: '83000.00',
      expenses: '41.50',
    });
  });

  it('falls back to net proceeds with a warning when the report has closed lots only', () => {
    const { positions, warnings } = parseAnyBrokerXML(ibReport(aaplLot), 'ib.xml', 2025);
    const lot = positions.find((p) => p.assetType === 'stocks')!;

    expect(lot.salePriceForeign).toBe('1999.00');
    expect(lot.saleCommissionForeign).toBeUndefined();
    expect(warnings.join()).toContain('Execution');
  });

  it('reads the ISIN of dividends', () => {
    const { positions } = parseAnyBrokerXML(ibReport(aaplSale + aaplLot), 'ib.xml', 2025);
    expect(positions.find((p) => p.assetType === 'dividends')).toMatchObject({
      isin: 'US0378331005',
      salePriceForeign: '100.00',
    });
  });
});

describe('Freedom Finance parser', () => {
  it('counts the purchase commission and converts each commission in its own currency', async () => {
    const xml = ffReport(
      '<company>Freedom Finance Europe Ltd</company>',
      ffTrade('buy', '2025-02-03', 420, 1, 'EUR') + ffTrade('sell', '2025-09-15', 380, 1, 'EUR'),
    );
    const result = parseAnyBrokerXML(xml, 'ff.xml', 2025);
    const [lot] = result.positions;

    expect(result.freedomEntity).toBe('europe');
    expect(lot).toMatchObject({
      purchaseCommissionForeign: '1.00',
      purchaseCommissionCurrency: 'EUR',
      saleCommissionForeign: '1.00',
      saleCommissionCurrency: 'EUR',
      expenses: '0',
      broker: 'Freedom Finance Europe',
      brokerJurisdiction: 'foreign',
    });

    const priced = await applyNbuRates(lot, mockNbu);
    // 2100 × 41.2; 1900 × 41.9; commissions €1 × 43 + €1 × 44.
    expect(priced).toMatchObject({
      purchasePrice: '86520.00',
      salePrice: '79610.00',
      expenses: '87.00',
    });
  });

  it('marks Фрідом Фінанс Україна as a Ukrainian broker and leaves unknown reports to the user', () => {
    expect(detectFreedomEntity('<company>ТОВ «Фрідом Фінанс Україна»</company>')).toBe('ukraine');
    expect(detectFreedomEntity('<company>Freedom Finance Europe</company>')).toBe('europe');

    const result = parseAnyBrokerXML(
      ffReport('', ffTrade('buy', '2025-02-03', 420, 1) + ffTrade('sell', '2025-09-15', 380, 1)),
      'ff.xml',
      2025,
    );
    expect(result.freedomEntity).toBeNull();
    expect(result.positions[0].brokerJurisdiction).toBeUndefined();
  });
});

describe('applyNbuRates', () => {
  it('reproduces the reference lots of the spec', async () => {
    const lot = (purchaseDate: string, saleDate: string, buy: string, sell: string) =>
      applyNbuRates(
        {
          id: 'x',
          assetType: 'stocks',
          currency: 'USD',
          purchaseDate,
          saleDate,
          purchasePriceForeign: buy,
          salePriceForeign: sell,
          purchaseRate: '',
          saleRate: '',
          purchasePrice: '',
          salePrice: '',
          expenses: '0',
          purchaseCommissionForeign: '1',
          saleCommissionForeign: '1',
        },
        mockNbu,
      );

    expect(await lot('2025-01-10', '2025-06-20', '1500', '2000')).toMatchObject({
      purchasePrice: '63000.00',
      salePrice: '83000.00',
      expenses: '83.50',
    });
    expect(await lot('2025-02-03', '2025-09-15', '2100', '1900')).toMatchObject({
      purchasePrice: '86520.00',
      salePrice: '79610.00',
      expenses: '83.10',
    });
  });

  it('prices dividends at the payment date only', async () => {
    const dividend = await applyNbuRates(
      {
        id: 'd',
        assetType: 'dividends',
        currency: 'USD',
        purchaseDate: '',
        saleDate: '2025-03-15',
        purchasePriceForeign: '0',
        salePriceForeign: '100',
        purchaseRate: '',
        saleRate: '',
        purchasePrice: '0',
        salePrice: '',
        expenses: '0',
      },
      mockNbu,
    );
    expect(dividend).toMatchObject({ saleRate: '41.8000', salePrice: '4180.00' });
  });
});
