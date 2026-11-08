/**
 * Writing rules of the e-reporting standard (order No. 729 of 29.11.2013): upper-case element
 * names in xs:sequence order, no gaps or tabs between elements, escaped special characters.
 */

/**
 * Text between elements. Open question 8: the standard forbids whitespace between elements; the
 * XSD allows it. Switch to '\r\n' only if an XML exported from the e-cabinet itself has breaks.
 */
export const ELEMENT_SEPARATOR = '';

export function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** `<NAME ROWNUM="n">value</NAME>`. */
export function el(name: string, value: string | number, rowNum?: number): string {
  const attr = rowNum === undefined ? '' : ` ROWNUM="${rowNum}"`;
  return `<${name}${attr}>${escapeXml(String(value))}</${name}>`;
}

/** Element with already-rendered children. */
export function group(name: string, children: readonly string[], attrs = ''): string {
  return `<${name}${attrs}>${children.join(ELEMENT_SEPARATOR)}</${name}>`;
}

/** Element only when the value is present. */
export function optional(name: string, value: string | number | null | undefined): string[] {
  return value === null || value === undefined || value === '' ? [] : [el(name, value)];
}

/** Whole document: declaration, root DECLAR bound to its XSD, head and body. */
export function xmlDocument(
  schema: string,
  head: readonly string[],
  body: readonly string[],
): string {
  return (
    '<?xml version="1.0" encoding="windows-1251"?>' +
    group(
      'DECLAR',
      [group('DECLARHEAD', head), group('DECLARBODY', body)],
      ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="${schema}"`,
    )
  );
}
