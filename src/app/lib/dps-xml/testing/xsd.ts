/**
 * Test-only: validate the exact windows-1251 bytes a user downloads against the official DPS XSD
 * (schemas/dps/2026) with xmllint. CI installs it with `apt-get install libxml2-utils`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect } from 'vitest';

const SCHEMAS = resolve('schemas/dps/2026');

export interface XsdResult {
  valid: boolean;
  errors: string;
}

/** Validate a generated file; the schema is taken from its xsi:noNamespaceSchemaLocation. */
export function validateAgainstXsd(file: {
  name: string;
  xml: string;
  bytes: Uint8Array;
}): XsdResult {
  const schema = /noNamespaceSchemaLocation="([^"]+)"/.exec(file.xml)?.[1];
  if (!schema) {
    return { valid: false, errors: 'no xsi:noNamespaceSchemaLocation' };
  }
  const dir = mkdtempSync(join(tmpdir(), 'taxered-xsd-'));
  const path = join(dir, file.name);
  try {
    writeFileSync(path, file.bytes);
    execFileSync('xmllint', ['--noout', '--schema', join(SCHEMAS, schema), path], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { valid: true, errors: '' };
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? String(error);
    return { valid: false, errors: stderr.replaceAll(dir, '') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Vitest assertion helper with the xmllint output in the failure message. */
export function expectValid(file: { name: string; xml: string; bytes: Uint8Array }): void {
  const result = validateAgainstXsd(file);
  expect(result.errors).toBe('');
  expect(result.valid).toBe(true);
}
