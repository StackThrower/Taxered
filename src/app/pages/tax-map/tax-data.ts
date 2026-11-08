/**
 * Simplified tax rates on investment income for individual tax residents, used by the
 * relocation map. Each rate is the top / typical headline rate on foreign-source income
 * (an IBKR-style brokerage account) for someone who has just moved to the country:
 * no treaty relief, allowances or thresholds. Special opt-in regimes for newcomers are
 * described in `regime` and are not reflected in the rates.
 */

export type Region = 'europe' | 'asia' | 'americas';
export type Metric = 'dividends' | 'capitalGains' | 'interest';

export interface CountryTax {
  /** ISO 3166-1 alpha-2 code. */
  code: string;
  name: string;
  region: Region;
  rates: Record<Metric, number>;
  /** Opt-in regime for new residents that can lower the tax (non-dom, flat tax, holiday…). */
  regime?: string;
  notes: readonly string[];
}

/** When the rates were last reviewed. */
export const DATA_UPDATED = 'початок 2026 року';

export const METRICS: readonly Metric[] = ['dividends', 'capitalGains', 'interest'];

export const REGIONS: readonly Region[] = ['europe', 'asia', 'americas'];

/** Ukraine is the baseline every country is compared with. */
export const BASELINE_CODE = 'UA';

export const COUNTRIES: readonly CountryTax[] = [
  // ── Europe ────────────────────────────────────────────────────────────────
  {
    code: 'IS',
    name: 'Ісландія',
    region: 'europe',
    rates: { dividends: 22, capitalGains: 22, interest: 22 },
    notes: ['Єдина ставка 22% на дохід від капіталу.'],
  },
  {
    code: 'NO',
    name: 'Норвегія',
    region: 'europe',
    rates: { dividends: 37.84, capitalGains: 37.84, interest: 22 },
    notes: [
      'Дивіденди та прибуток з акцій множаться на 1,72 і оподатковуються за 22% — фактично 37,84%.',
      'Є податок на капітал (wealth tax) до 1,1% на рік.',
    ],
  },
  {
    code: 'SE',
    name: 'Швеція',
    region: 'europe',
    rates: { dividends: 30, capitalGains: 30, interest: 30 },
    notes: [
      '30% на дохід від капіталу.',
      'Рахунок ISK: замість податку на дохід — умовний податок ≈1% від вартості активів на рік.',
    ],
  },
  {
    code: 'FI',
    name: 'Фінляндія',
    region: 'europe',
    rates: { dividends: 28.9, capitalGains: 34, interest: 34 },
    notes: [
      '30% до 30 тис. € доходу від капіталу, 34% — понад.',
      'Оподатковується 85% дивідендів від публічних компаній — фактично до 28,9%.',
    ],
  },
  {
    code: 'IE',
    name: 'Ірландія',
    region: 'europe',
    rates: { dividends: 52, capitalGains: 33, interest: 52 },
    regime:
      'Remittance basis для non-domiciled: іноземний дохід оподатковується лише при переказі в Ірландію.',
    notes: [
      'Дивіденди й іноземні відсотки — за прогресивною шкалою до 40% + USC 8% + PRSI 4%.',
      'Приріст капіталу — 33%. Фонди ЄС (ETF) — exit tax 38% і «deemed disposal» кожні 8 років.',
    ],
  },
  {
    code: 'GB',
    name: 'Велика Британія',
    region: 'europe',
    rates: { dividends: 39.35, capitalGains: 24, interest: 45 },
    regime:
      'FIG regime: перші 4 роки після переїзду іноземні доходи та прирости не оподатковуються (якщо не були резидентом 10 років).',
    notes: [
      'Прогресивні ставки: дивіденди до 39,35%, відсотки до 45%, приріст капіталу 18/24%.',
      'ISA-рахунок до £20 тис. на рік — без податку.',
    ],
  },
  {
    code: 'DK',
    name: 'Данія',
    region: 'europe',
    rates: { dividends: 42, capitalGains: 42, interest: 42 },
    notes: [
      'Дохід з акцій: 27% до порогу (~79 тис. DKK), 42% понад.',
      'Більшість іноземних ETF оподатковуються щороку за переоцінкою (mark-to-market).',
    ],
  },
  {
    code: 'EE',
    name: 'Естонія',
    region: 'europe',
    rates: { dividends: 22, capitalGains: 22, interest: 22 },
    notes: [
      'Єдина ставка 22%.',
      'Інвестиційний рахунок (investeerimiskonto) відкладає податок до виведення коштів.',
    ],
  },
  {
    code: 'NL',
    name: 'Нідерланди',
    region: 'europe',
    rates: { dividends: 36, capitalGains: 36, interest: 36 },
    notes: [
      'Box 3: 36% від умовної дохідності, а не від фактичного доходу — фактично ≈2% від вартості активів на рік.',
      'Пільга 30% для запрошених фахівців не звільняє інвестиції з 2025 року.',
    ],
  },
  {
    code: 'DE',
    name: 'Німеччина',
    region: 'europe',
    rates: { dividends: 26.38, capitalGains: 26.38, interest: 26.38 },
    notes: [
      'Abgeltungsteuer 25% + солідарний збір 5,5% = 26,375% (+ церковний податок за наявності).',
      'Неоподатковуваний мінімум — 1 000 € на рік.',
    ],
  },
  {
    code: 'PL',
    name: 'Польща',
    region: 'europe',
    rates: { dividends: 19, capitalGains: 19, interest: 19 },
    notes: [
      'Податок Белки — 19% на всі інвестиційні доходи.',
      'Солідарний збір 4% з доходу понад 1 млн PLN.',
    ],
  },
  {
    code: 'LV',
    name: 'Латвія',
    region: 'europe',
    rates: { dividends: 20, capitalGains: 25.5, interest: 25.5 },
    notes: [
      'Дохід від капіталу — 25,5%, дивіденди — 20%.',
      'Є інвестиційний рахунок з відстроченням податку.',
    ],
  },
  {
    code: 'BE',
    name: 'Бельгія',
    region: 'europe',
    rates: { dividends: 30, capitalGains: 10, interest: 30 },
    notes: [
      'Дивіденди й відсотки — 30%, з невеликими щорічними пільгами.',
      'З 2026 року — 10% на приріст капіталу з фінансових активів з річним звільненням 10 тис. €.',
      'Податок 0,12% на операції з ЦП (TOB).',
    ],
  },
  {
    code: 'LU',
    name: 'Люксембург',
    region: 'europe',
    rates: { dividends: 22.89, capitalGains: 0, interest: 20 },
    notes: [
      'Оподатковується 50% дивідендів за прогресивною шкалою — фактично до ≈22,9%.',
      'Приріст капіталу з ЦП не оподатковується, якщо володіння понад 6 місяців і частка менше 10%.',
    ],
  },
  {
    code: 'CZ',
    name: 'Чехія',
    region: 'europe',
    rates: { dividends: 15, capitalGains: 15, interest: 15 },
    notes: [
      '15%, понад поріг (~1,7 млн CZK) — 23%.',
      'Продаж ЦП, якими володіли понад 3 роки, звільнений від податку (до 40 млн CZK на рік).',
    ],
  },
  {
    code: 'SK',
    name: 'Словаччина',
    region: 'europe',
    rates: { dividends: 10, capitalGains: 19, interest: 19 },
    notes: [
      'Дивіденди — 10%, інший дохід від капіталу — 19/25%.',
      'Біржові ЦП, якими володіли понад рік, можуть бути звільнені від податку.',
    ],
  },
  {
    code: 'LT',
    name: 'Литва',
    region: 'europe',
    rates: { dividends: 15, capitalGains: 15, interest: 15 },
    notes: [
      '15% до порогу (120 середніх зарплат), 20% понад.',
      'Інвестиційний рахунок відкладає податок до виведення коштів.',
    ],
  },
  {
    code: 'FR',
    name: 'Франція',
    region: 'europe',
    rates: { dividends: 30, capitalGains: 30, interest: 30 },
    regime:
      'Імпатріанти: 50% іноземних дивідендів і відсотків звільнено на 8 років (за умови роботи у Франції).',
    notes: [
      'PFU (flat tax): 12,8% податку + 17,2% соціальних внесків = 30%.',
      'Можливе підвищення соцвнесків — перевіряйте актуальну ставку.',
    ],
  },
  {
    code: 'CH',
    name: 'Швейцарія',
    region: 'europe',
    rates: { dividends: 40, capitalGains: 0, interest: 40 },
    regime: 'Паушальне оподаткування (lump-sum) за витратами — для тих, хто не працює в Швейцарії.',
    notes: [
      'Приватні інвестори не платять податку з приросту капіталу.',
      'Дивіденди й відсотки — як звичайний дохід: від ~22% (Цуг) до ~45% (Женева).',
      'Є кантональний податок на капітал (wealth tax).',
    ],
  },
  {
    code: 'AT',
    name: 'Австрія',
    region: 'europe',
    rates: { dividends: 27.5, capitalGains: 27.5, interest: 27.5 },
    notes: ['KESt 27,5% на всі інвестиційні доходи; відсотки за банківськими вкладами — 25%.'],
  },
  {
    code: 'HU',
    name: 'Угорщина',
    region: 'europe',
    rates: { dividends: 28, capitalGains: 28, interest: 28 },
    notes: [
      '15% ПДФО + 13% соціального внеску (szocho) до річного ліміту.',
      'Рахунок TBSZ: без податку після 5 років.',
    ],
  },
  {
    code: 'UA',
    name: 'Україна',
    region: 'europe',
    rates: { dividends: 23, capitalGains: 23, interest: 23 },
    notes: [
      'ПДФО 18% + військовий збір 5% на іноземні дивіденди, відсотки та інвестиційний прибуток.',
      'Дивіденди від українських компаній — 9% + 5%.',
    ],
  },
  {
    code: 'ES',
    name: 'Іспанія',
    region: 'europe',
    rates: { dividends: 30, capitalGains: 30, interest: 30 },
    regime:
      'Закон Бекхема: 6 років іноземні дивіденди, відсотки й прирости не оподатковуються (для найманих працівників і стартаперів).',
    notes: [
      'Шкала доходів від заощаджень: 19–30% (30% понад 300 тис. €).',
      'Регіональний податок на майно та податок солідарності на великі статки.',
    ],
  },
  {
    code: 'AD',
    name: 'Андорра',
    region: 'europe',
    rates: { dividends: 10, capitalGains: 10, interest: 10 },
    notes: [
      'Максимальна ставка ПДФО — 10%; перші 3 000 € доходу від заощаджень не оподатковуються.',
      'Потрібен дозвіл на проживання (пасивна резиденція з інвестицією).',
    ],
  },
  {
    code: 'MC',
    name: 'Монако',
    region: 'europe',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: [
      'Немає податку на доходи фізосіб (крім громадян Франції).',
      'Дуже дороге проживання та високий поріг резидентства.',
    ],
  },
  {
    code: 'SI',
    name: 'Словенія',
    region: 'europe',
    rates: { dividends: 25, capitalGains: 25, interest: 25 },
    notes: ['25%; ставка на приріст капіталу знижується з терміном володіння — 0% після 15 років.'],
  },
  {
    code: 'HR',
    name: 'Хорватія',
    region: 'europe',
    rates: { dividends: 12, capitalGains: 12, interest: 12 },
    notes: ['12% на дохід від капіталу.', 'Продаж ЦП після 2 років володіння не оподатковується.'],
  },
  {
    code: 'RO',
    name: 'Румунія',
    region: 'europe',
    rates: { dividends: 16, capitalGains: 16, interest: 10 },
    notes: [
      'Дивіденди — 16% з 2026 року.',
      'Приріст капіталу через іноземного брокера — 16%; через румунського — 3% (понад рік) або 6%.',
      'Медичний внесок CASS 10% з інвестиційного доходу понад поріг.',
    ],
  },
  {
    code: 'GE',
    name: 'Грузія',
    region: 'europe',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: [
      'Іноземні доходи фізичних осіб не оподатковуються.',
      'Грузинські дивіденди та відсотки — 5%, інший дохід — 20%.',
    ],
  },
  {
    code: 'PT',
    name: 'Португалія',
    region: 'europe',
    rates: { dividends: 28, capitalGains: 28, interest: 28 },
    regime:
      'IFICI («NHR 2.0»): 10 років іноземні дивіденди, відсотки й прирости звільнені — для науки, ІТ, стартапів та ін.',
    notes: [
      'Єдина ставка 28%; можна обрати прогресивну шкалу.',
      'Доходи з «офшорних» юрисдикцій — 35%.',
    ],
  },
  {
    code: 'IT',
    name: 'Італія',
    region: 'europe',
    rates: { dividends: 26, capitalGains: 26, interest: 26 },
    regime:
      'Фіксований податок на всі іноземні доходи для нових резидентів (сотні тисяч € на рік) — до 15 років.',
    notes: [
      '26% на інвестиційні доходи; державні облігації — 12,5%.',
      'IVAFE 0,2% на рік від вартості іноземних рахунків.',
    ],
  },
  {
    code: 'ME',
    name: 'Чорногорія',
    region: 'europe',
    rates: { dividends: 15, capitalGains: 15, interest: 15 },
    notes: ['15% на дивіденди, відсотки та приріст капіталу.'],
  },
  {
    code: 'RS',
    name: 'Сербія',
    region: 'europe',
    rates: { dividends: 15, capitalGains: 15, interest: 15 },
    notes: ['15% на дохід від капіталу; приріст після 10 років володіння — звільнений.'],
  },
  {
    code: 'BG',
    name: 'Болгарія',
    region: 'europe',
    rates: { dividends: 5, capitalGains: 10, interest: 8 },
    notes: [
      'Дивіденди — 5%, єдина ставка ПДФО — 10%.',
      'Продаж акцій на регульованих ринках ЄС/ЄЕЗ не оподатковується.',
    ],
  },
  {
    code: 'MT',
    name: 'Мальта',
    region: 'europe',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: [
      'Non-dom резиденти: іноземний дохід оподатковується лише при переказі на Мальту, іноземний приріст капіталу — ніколи.',
      'Мінімальний податок 5 000 € на рік, якщо іноземний дохід понад 35 тис. €.',
    ],
  },
  {
    code: 'GR',
    name: 'Греція',
    region: 'europe',
    rates: { dividends: 5, capitalGains: 15, interest: 15 },
    regime:
      'Non-dom: фіксовані 100 тис. € на рік за всі іноземні доходи (при інвестиції від 500 тис. €), до 15 років.',
    notes: [
      'Дивіденди — 5%, відсотки — 15%, приріст капіталу з ЦП — 15%.',
      'Пенсіонери з-за кордону можуть отримати 7% на всі іноземні доходи.',
    ],
  },
  {
    code: 'CY',
    name: 'Кіпр',
    region: 'europe',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: [
      'Новоприбулі отримують статус non-dom на 17 років: дивіденди й відсотки без податку і без внеску SDC.',
      'Приріст капіталу з ЦП не оподатковується (податок лише на кіпрську нерухомість).',
      'Внесок GHS 2,65% на пасивний дохід.',
    ],
  },

  // ── Asia ──────────────────────────────────────────────────────────────────
  {
    code: 'AM',
    name: 'Вірменія',
    region: 'asia',
    rates: { dividends: 5, capitalGains: 10, interest: 10 },
    notes: [
      'Дивіденди — 5%, відсотки й приріст капіталу — 10%.',
      'Деталі для іноземних брокерів уточнюйте в консультанта.',
    ],
  },
  {
    code: 'KZ',
    name: 'Казахстан',
    region: 'asia',
    rates: { dividends: 10, capitalGains: 10, interest: 10 },
    notes: [
      'Базова ставка 10%, для великих доходів — 15% (новий Податковий кодекс 2026).',
      'Дохід від ЦП на біржах МФЦА (AIFC) звільнений.',
    ],
  },
  {
    code: 'CN',
    name: 'Китай',
    region: 'asia',
    rates: { dividends: 20, capitalGains: 20, interest: 20 },
    regime:
      'Іноземці, які живуть у Китаї менше 6 років поспіль, не платять податку з іноземних доходів.',
    notes: ['20% на дивіденди, відсотки та приріст капіталу.'],
  },
  {
    code: 'KR',
    name: 'Південна Корея',
    region: 'asia',
    rates: { dividends: 15.4, capitalGains: 22, interest: 15.4 },
    notes: [
      'Дивіденди й відсотки — 15,4% до 20 млн KRW на рік, понад — прогресивна шкала до 49,5%.',
      'Приріст з іноземних акцій — 22% понад 2,5 млн KRW.',
    ],
  },
  {
    code: 'JP',
    name: 'Японія',
    region: 'asia',
    rates: { dividends: 20.32, capitalGains: 20.32, interest: 20.32 },
    notes: [
      '20,315% на інвестиційні доходи.',
      'NISA — неоподатковуваний рахунок до 3,6 млн JPY внесків на рік.',
      'Нерезиденти-іноземці перші 5 років платять з іноземних доходів лише при переказі в Японію.',
    ],
  },
  {
    code: 'IL',
    name: 'Ізраїль',
    region: 'asia',
    rates: { dividends: 25, capitalGains: 25, interest: 25 },
    regime: 'Нові репатріанти (олім): 10 років іноземні доходи не оподатковуються.',
    notes: ['25% + додатковий податок 3–5% на високі доходи.'],
  },
  {
    code: 'BH',
    name: 'Бахрейн',
    region: 'asia',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: ['Немає податку на доходи фізичних осіб.'],
  },
  {
    code: 'QA',
    name: 'Катар',
    region: 'asia',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: ['Немає податку на інвестиційні доходи фізичних осіб.'],
  },
  {
    code: 'IN',
    name: 'Індія',
    region: 'asia',
    rates: { dividends: 35.88, capitalGains: 12.5, interest: 39 },
    regime: 'Статус RNOR: перші 2–3 роки іноземні доходи не оподатковуються.',
    notes: [
      'Дивіденди й відсотки — за шкалою до 30% + надбавки.',
      'Довгостроковий приріст з акцій — 12,5%, короткостроковий — 20%.',
    ],
  },
  {
    code: 'HK',
    name: 'Гонконг',
    region: 'asia',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: ['Немає податку на дивіденди, відсотки й приріст капіталу для фізичних осіб.'],
  },
  {
    code: 'SA',
    name: 'Саудівська Аравія',
    region: 'asia',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: ['Немає податку на доходи для фізичних осіб-іноземців.'],
  },
  {
    code: 'AE',
    name: 'ОАЕ',
    region: 'asia',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: [
      'Немає податку на доходи фізичних осіб.',
      'Резидентство: золота віза або робоча/інвесторська віза; податкове резидентство — від 183 днів.',
    ],
  },
  {
    code: 'TH',
    name: 'Таїланд',
    region: 'asia',
    rates: { dividends: 35, capitalGains: 35, interest: 35 },
    regime: 'Віза LTR: іноземні доходи, ввезені в країну, не оподатковуються.',
    notes: [
      'Іноземні доходи (з 2024 року) оподатковуються за шкалою до 35% при ввезенні в Таїланд.',
      'Якщо не ввозити гроші в країну — податку немає.',
    ],
  },
  {
    code: 'MY',
    name: 'Малайзія',
    region: 'asia',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: [
      'Іноземні доходи фізичних осіб звільнені (до 2036 року).',
      'Приріст капіталу фізосіб не оподатковується; на великі місцеві дивіденди — 2%.',
    ],
  },
  {
    code: 'SG',
    name: 'Сінгапур',
    region: 'asia',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: ['Іноземні доходи фізичних осіб, приріст капіталу та дивіденди не оподатковуються.'],
  },

  // ── Americas ──────────────────────────────────────────────────────────────
  {
    code: 'CA',
    name: 'Канада',
    region: 'americas',
    rates: { dividends: 39.34, capitalGains: 26.76, interest: 53.53 },
    notes: [
      'Федеральний + провінційний податок (дані для Онтаріо, найвища ставка).',
      'Оподатковується 50% приросту капіталу.',
      'Рахунки TFSA та RRSP — без податку або з відстроченням.',
    ],
  },
  {
    code: 'US',
    name: 'США',
    region: 'americas',
    rates: { dividends: 23.8, capitalGains: 23.8, interest: 40.8 },
    notes: [
      'Кваліфіковані дивіденди й довгостроковий приріст — до 20% + NIIT 3,8%.',
      'Відсотки й короткостроковий приріст — до 37% + 3,8%.',
      'Плюс податок штату: 0% (Флорида, Техас) — 13,3% (Каліфорнія).',
    ],
  },
  {
    code: 'MX',
    name: 'Мексика',
    region: 'americas',
    rates: { dividends: 35, capitalGains: 35, interest: 35 },
    notes: [
      'Іноземні інвестиційні доходи — за шкалою до 35%.',
      'Акції на мексиканській біржі (BMV) — 10% з приросту та дивідендів.',
    ],
  },
  {
    code: 'KY',
    name: 'Кайманові острови',
    region: 'americas',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: ['Немає податку на доходи, приріст капіталу й спадщину.'],
  },
  {
    code: 'BS',
    name: 'Багами',
    region: 'americas',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: ['Немає податку на доходи та приріст капіталу.'],
  },
  {
    code: 'CR',
    name: 'Коста-Рика',
    region: 'americas',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: ['Територіальна система: іноземні доходи фізичних осіб не оподатковуються.'],
  },
  {
    code: 'PA',
    name: 'Панама',
    region: 'americas',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: [
      'Територіальна система: іноземні доходи не оподатковуються.',
      'Програма Friendly Nations та пенсіонерська віза — прості шляхи до резидентства.',
    ],
  },
  {
    code: 'BR',
    name: 'Бразилія',
    region: 'americas',
    rates: { dividends: 15, capitalGains: 15, interest: 15 },
    notes: [
      'З 2024 року іноземні інвестиції фізосіб — 15% раз на рік.',
      'Місцеві дивіденди понад 50 тис. BRL на місяць — 10% з 2026 року.',
    ],
  },
  {
    code: 'PY',
    name: 'Парагвай',
    region: 'americas',
    rates: { dividends: 0, capitalGains: 0, interest: 0 },
    notes: [
      'Територіальна система: іноземні доходи не оподатковуються.',
      'Місцеві дивіденди — 8%.',
    ],
  },
  {
    code: 'CL',
    name: 'Чилі',
    region: 'americas',
    rates: { dividends: 40, capitalGains: 40, interest: 40 },
    regime: 'Перші 3 роки (з можливим продовженням) іноземці платять лише з чилійських доходів.',
    notes: ['Прогресивна шкала до 40% на світовий дохід.'],
  },
  {
    code: 'UY',
    name: 'Уругвай',
    region: 'americas',
    rates: { dividends: 12, capitalGains: 0, interest: 12 },
    regime:
      'Податкові канікули для нових резидентів: 11 років іноземні дивіденди й відсотки не оподатковуються (або 7% замість 12%).',
    notes: [
      'Іноземні дивіденди й відсотки — 12%.',
      'Іноземний приріст капіталу не оподатковується.',
    ],
  },
];

export interface RateBin {
  /** Upper bound (inclusive) of the bin. */
  max: number;
  label: string;
  bg: string;
  fg: string;
}

/**
 * Sequential scale from tax-free (green) to high tax (red). Every background is paired with
 * a text colour that keeps at least 4.5:1 contrast, and the rate is always printed on the
 * tile, so colour is never the only cue.
 */
export const RATE_BINS: readonly RateBin[] = [
  { max: 0, label: '0%', bg: '#0b7a4b', fg: '#ffffff' },
  { max: 10, label: 'до 10%', bg: '#9fd8a8', fg: '#0b2a14' },
  { max: 20, label: '10–20%', bg: '#f3d77b', fg: '#2a2100' },
  { max: 30, label: '20–30%', bg: '#f2a25c', fg: '#2a1400' },
  { max: Infinity, label: 'понад 30%', bg: '#c0392b', fg: '#ffffff' },
];

export function rateBin(rate: number): RateBin {
  return RATE_BINS.find((bin) => rate <= bin.max) ?? RATE_BINS[RATE_BINS.length - 1];
}

/** Flag emoji from an ISO alpha-2 code. */
export function flagOf(code: string): string {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

const percent = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 });

export function formatRate(rate: number): string {
  return `${percent.format(rate)}%`;
}

export function countriesIn(region: Region): CountryTax[] {
  return COUNTRIES.filter((c) => c.region === region);
}

export function getCountry(code: string): CountryTax | undefined {
  return COUNTRIES.find((c) => c.code === code);
}
