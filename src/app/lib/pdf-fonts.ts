/**
 * DejaVu Sans Font Setup for jsPDF
 * This module provides helper functions to register DejaVu Sans fonts
 * with Cyrillic/Ukrainian character support
 */

import type { jsPDF } from 'jspdf';

// Cache for font data to avoid repeated downloads
let fontCache: { normal: string; bold: string } | null = null;

/**
 * Setup DejaVu Sans fonts for jsPDF with Cyrillic support
 * This version loads fonts from the public directory at runtime
 * Fonts are registered for EACH new PDF document
 */
/** Reads the regular and bold DejaVu Sans TTF files; the server reads them from disk. */
export type FontLoader = () => Promise<{ normal: ArrayBuffer; bold: ArrayBuffer } | null>;

/** Browser default: the fonts are served from the public directory. */
const fetchFonts: FontLoader = async () => {
  const [normal, bold] = await Promise.all([
    fetch('/fonts/DejaVuSans.ttf'),
    fetch('/fonts/DejaVuSans-Bold.ttf'),
  ]);
  if (!normal.ok || !bold.ok) {
    return null;
  }
  return { normal: await normal.arrayBuffer(), bold: await bold.arrayBuffer() };
};

export async function setupUkrainianFonts(
  doc: jsPDF,
  loadFonts: FontLoader = fetchFonts,
): Promise<boolean> {
  try {
    let normalBase64: string;
    let boldBase64: string;

    // Use cached font data if available, otherwise download
    if (fontCache) {
      normalBase64 = fontCache.normal;
      boldBase64 = fontCache.bold;
      console.log('📦 Using cached Ukrainian fonts');
    } else {
      const fonts = await loadFonts();
      if (!fonts) {
        console.error('Failed to load font files');
        return false;
      }

      // Convert to base64
      normalBase64 = arrayBufferToBase64(fonts.normal);
      boldBase64 = arrayBufferToBase64(fonts.bold);

      // Cache the font data for future use
      fontCache = { normal: normalBase64, bold: boldBase64 };
      console.log('✅ Ukrainian fonts downloaded and cached');
    }

    // Register fonts with THIS PDF document
    doc.addFileToVFS('DejaVuSans.ttf', normalBase64);
    doc.addFileToVFS('DejaVuSans-Bold.ttf', boldBase64);

    doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');

    doc.setFont('DejaVuSans', 'normal');

    console.log('✅ Ukrainian fonts registered for new PDF document');
    return true;
  } catch (error) {
    console.error('Could not load Ukrainian fonts:', error);
    return false;
  }
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 32768; // Process in chunks for better performance

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return btoa(binary);
}

/**
 * Check if fonts are cached (downloaded once)
 */
export function areFontsCached(): boolean {
  return fontCache !== null;
}

/**
 * Clear font cache (useful for testing or forcing reload)
 */
export function clearFontCache(): void {
  fontCache = null;
  console.log('🗑️ Font cache cleared');
}
