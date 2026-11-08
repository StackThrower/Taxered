let win1251: Map<number, number> | null = null;

function table(): Map<number, number> {
  if (!win1251) {
    win1251 = new Map();
    const decoder = new TextDecoder('windows-1251');
    for (let byte = 0x80; byte <= 0xff; byte++) {
      const char = decoder.decode(new Uint8Array([byte]));
      if (char !== '�') {
        win1251.set(char.charCodeAt(0), byte);
      }
    }
  }
  return win1251;
}

/**
 * Encode text as windows-1251, the encoding the DPS e-cabinet expects. Characters the code page
 * lacks become "?"; find them first with `unencodableChars`.
 */
export function encodeWindows1251(text: string): Uint8Array<ArrayBuffer> {
  const map = table();
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[i] = code < 0x80 ? code : (map.get(code) ?? 0x3f);
  }
  return bytes;
}

/** Distinct characters of the text that windows-1251 cannot represent. */
export function unencodableChars(text: string): string[] {
  const map = table();
  const found = new Set<string>();
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (char.length > 1 || (code >= 0x80 && !map.has(code))) {
      found.add(char);
    }
  }
  return [...found];
}
