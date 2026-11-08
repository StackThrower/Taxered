export interface TaxForm {
  id: string;
  title: string;
  description: string;
  features: readonly string[];
  year: number;
}

export const UA_COUNTRY = { name: 'Ukraine', flag: '🇺🇦' } as const;

// Tax forms available for Ukraine (researched from official tax authorities).
export const UA_TAX_FORMS: readonly TaxForm[] = [
  {
    id: 'f0121214',
    title: 'F0100215 + Ф1 (F0121215)',
    description:
      "Декларація про майновий стан і доходи з додатком Ф1 — розрахунок податкових зобов'язань",
    features: ['ПДФО від інвестицій', 'Військовий збір', 'Пакет XML для Е-кабінету'],
    year: 2026,
  },
];
