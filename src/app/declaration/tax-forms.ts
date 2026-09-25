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
    title: 'F0121214 (Ф1)',
    description: "Додаток Ф1 - Розрахунок податкових зобов'язань",
    features: ['ПДФО від інвестицій', 'Військовий збір', "Розрахунок зобов'язань"],
    year: 2026,
  },
];
