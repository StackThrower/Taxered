/** Taxpayer details for the return header, validated against the XSD patterns. */

export interface TaxpayerAddress {
  region?: string;
  district?: string;
  city: string;
  street: string;
  building?: string;
  corpus?: string;
  apartment?: string;
  zip?: string;
}

export interface Taxpayer {
  fullName: string;
  /** RNOKPP, 9-digit ID-card number, or passport series + number. */
  taxNumber: string;
  /** Code of the tax office the return is filed with, e.g. "2650". */
  taxOfficeCode: string;
  /** HSTI: name of that tax office. */
  taxOfficeName: string;
  address: TaxpayerAddress;
  phone?: string;
  email?: string;
}

/** Fields a validation error can point the user to (ids of the form inputs). */
export type TaxpayerField =
  | 'fullName'
  | 'taxNumber'
  | 'taxOfficeCode'
  | 'taxOfficeName'
  | 'city'
  | 'street'
  | 'zip'
  | 'phone'
  | 'email';

export interface FieldError {
  field?: TaxpayerField | 'clarifiedRegNumber' | 'docNumber';
  message: string;
}

/** DGDRFO_10 (HTIN) ∩ DGLong (TIN): 10 digits, 9 digits (ID card) or passport series + number. */
const TIN_PATTERN = /^(\d{10}|\d{9}|[АБВГДЕЄЖЗИІКЛМНОПРСТУФХЦЧШЩЮЯ]{2}\d{6})$/;
/** DGc_dpi from common_types.xsd. */
const TAX_OFFICE_PATTERN =
  /^((3070)|(3[1-5]00)|(9001)|(9191)|(9393)|(9494)|(9900)|(9911)|(9970)|(999[1-9])|(2[0-8][0-9]{2})|(1[0-9]{3})|([1-9][0-9]{2}))$/;
const ZIP_PATTERN = /^\d{5}$/;
const PHONE_PATTERN = /^[0-9 ()\-+.,;]{4,}$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/;

export function normalizeTin(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** Tax office code padded to the four digits of C_REG + C_RAJ. */
export function normalizeTaxOffice(value: string): string {
  return value.trim().padStart(4, '0');
}

/** Name, TIN and tax office: what every document of the package needs. */
export function validateIdentity(
  t: Pick<Taxpayer, 'fullName' | 'taxNumber' | 'taxOfficeCode'>,
): FieldError | null {
  if (!t.fullName.trim()) {
    return { field: 'fullName', message: "Вкажіть прізвище, ім'я та по батькові." };
  }
  if (!TIN_PATTERN.test(normalizeTin(t.taxNumber))) {
    return {
      field: 'taxNumber',
      message: 'ІПН має містити 10 цифр (або 9 цифр ID-картки чи серію та номер паспорта).',
    };
  }
  if (!TAX_OFFICE_PATTERN.test(t.taxOfficeCode.trim())) {
    return {
      field: 'taxOfficeCode',
      message: 'Вкажіть код ДПІ, до якої подається декларація (3–4 цифри, наприклад 2650).',
    };
  }
  return null;
}

/** Everything the declaration header F0100215 requires on top of the identity. */
export function validateTaxpayer(t: Taxpayer): FieldError | null {
  const identity = validateIdentity(t);
  if (identity) {
    return identity;
  }
  if (!t.taxOfficeName.trim()) {
    return {
      field: 'taxOfficeName',
      message: 'Вкажіть назву ДПІ, до якої подається декларація (рядок 5 декларації).',
    };
  }
  if (!t.address.city.trim()) {
    return { field: 'city', message: 'Вкажіть населений пункт податкової адреси.' };
  }
  if (!t.address.street.trim()) {
    return { field: 'street', message: 'Вкажіть вулицю податкової адреси.' };
  }
  const zip = t.address.zip?.trim();
  if (zip && !ZIP_PATTERN.test(zip)) {
    return { field: 'zip', message: 'Поштовий індекс має містити 5 цифр.' };
  }
  const phone = t.phone?.trim();
  if (phone && !PHONE_PATTERN.test(phone)) {
    return {
      field: 'phone',
      message: 'Телефон може містити лише цифри, пробіли та символи ( ) - +.',
    };
  }
  const email = t.email?.trim();
  if (email && !EMAIL_PATTERN.test(email)) {
    return { field: 'email', message: 'Перевірте електронну адресу.' };
  }
  return null;
}
