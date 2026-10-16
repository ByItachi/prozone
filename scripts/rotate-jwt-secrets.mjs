#!/usr/bin/env node
// Rotates the JWT signing secrets in the project's .env file.
//
//   node scripts/rotate-jwt-secrets.mjs [path/to/.env]     # default: ./.env
//
// - generates 48 random bytes per secret (base64url, ~64 chars)
// - replaces the existing keys in place and appends them when missing
// - never prints the values; runs a git-tracked-file safety check
// - existing access/refresh tokens become invalid: restart the API and expect
//   every user to sign in again (see docs/security-credential-remediation.md)

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const KEYS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
const MIN_LENGTH = 32;
const envPath = resolve(process.argv[2] ?? '.env');

let text;
try {
  text = readFileSync(envPath, 'utf8');
} catch (error) {
  console.error(`cannot read ${envPath}: ${error.message}`);
  process.exit(1);
}

// Never rotate a version-controlled env file: that would commit the secrets.
try {
  const tracked = execFileSync('git', ['ls-files', '--error-unmatch', envPath], { stdio: 'pipe' });
  if (tracked) {
    console.error(`${envPath} is tracked by git — refusing to write secrets into it.`);
    process.exit(1);
  }
} catch {
  // not tracked (expected)
}

const weak = KEYS.filter((key) => {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm').exec(text);
  return !match || match[1].trim().length < MIN_LENGTH;
});
if (weak.length === 0) {
  console.log('both secrets already meet the minimum length; rotating anyway (values not printed).');
}

const generated = new Map(KEYS.map((key) => [key, randomBytes(48).toString('base64url')]));
const seen = new Set();

let updated = text.split(/\r?\n/).map((line) => {
  const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
  if (!match || !generated.has(match[1])) return line;
  seen.add(match[1]);
  return `${match[1]}=${generated.get(match[1])}`;
});

for (const key of KEYS) {
  if (!seen.has(key)) updated.push(`${key}=${generated.get(key)}`);
}

writeFileSync(envPath, updated.join('\n'), 'utf8');

console.log(`rotated ${generated.size} secret(s) in ${envPath} (values never printed)`);
console.log(`lengths: ${[...generated.values()].map((v) => v.length).join(', ')} chars`);
console.log('next: restart the API so it picks up the new secrets; all sessions are invalidated.');
