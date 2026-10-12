import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** Génère un identifiant préfixé, court et non devinable (ex. "prd_7k2m9x4q1d"). */
export function newId(prefix: string, length = 10): string {
  const bytes = randomBytes(length);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return `${prefix}_${out}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
