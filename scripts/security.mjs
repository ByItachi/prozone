#!/usr/bin/env node
// Single entry point for repository security checks.
//
//   node scripts/security.mjs            # full run: env hygiene + hook wiring + tracked/staged scans
//   node scripts/security.mjs --history  # + every blob reachable from any ref + commit messages
//   node scripts/security.mjs --staged   # staged files only (used by .githooks/pre-commit)
//   node scripts/security.mjs --ci       # tracked tree + env hygiene, no git config assumptions
//
// Exit codes: 0 = every check passed, 1 = a check failed.
// Findings are printed by the scanner (scripts/scan-secrets.mjs) that this wraps.

import { execFileSync, spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const STAGED_ONLY = argv.includes('--staged');
const CI = argv.includes('--ci');
const HISTORY = argv.includes('--history');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
}

function runScanner(extraArgs) {
  const res = spawnSync(process.execPath, ['scripts/scan-secrets.mjs', ...extraArgs], {
    stdio: 'inherit',
  });
  return res.status === 0;
}

// 1 ── env hygiene ───────────────────────────────────────────────────────────
// Only templated env files may be committed; a tracked real .env is a leak.
if (!STAGED_ONLY) {
  const trackedEnv = git(['ls-files', '--', '.env', '.env.*'])
    .split('\n')
    .filter((f) => f && !/\.(example|sample|template)$/.test(f));
  record(
    'no real .env tracked by git',
    trackedEnv.length === 0,
    trackedEnv.length ? trackedEnv.join(', ') : 'only templates',
  );
}

// 2 ── pre-commit hook wiring ────────────────────────────────────────────────
if (!STAGED_ONLY && !CI) {
  let hooksPath = '';
  try {
    hooksPath = git(['config', 'core.hooksPath']);
  } catch {
    // unset
  }
  record(
    'pre-commit hook installed',
    hooksPath === '.githooks',
    hooksPath ? `core.hooksPath=${hooksPath}` : 'run: git config core.hooksPath .githooks',
  );
}

// 3 ── secret scan ───────────────────────────────────────────────────────────
// One scanner, three views: what is committed, what is about to be, and (with
// --history) what history already contains: blobs from any ref + commit messages.
//
// The history pass is opt-in because it is still expected to fail until the
// remediation plan's history rewrite runs (see
// docs/security-credential-remediation.md). A gate that is permanently red is a
// gate people learn to ignore, so the default run stays actionable: it answers
// "am I about to introduce a new secret?" and is green when the answer is no.
if (STAGED_ONLY) {
  record('secret scan: staged files', runScanner(['--staged']), '');
} else {
  record('secret scan: tracked files', runScanner([]), '');
  record('secret scan: staged files', runScanner(['--staged']), '');
  if (HISTORY) {
    record('secret scan: git history', runScanner(['--history']), '');
  }
}

// ── report ──────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);

console.log('\nsecurity checks');
for (const r of results) {
  const mark = r.ok ? '  ok  ' : ' FAIL ';
  const detail = r.detail ? ` — ${r.detail}` : '';
  console.log(`  ${mark} ${r.name}${detail}`);
}

if (failed.length === 0) {
  console.log(`\nsecurity: ${results.length}/${results.length} checks passed`);
  process.exit(0);
}

console.error(`\nsecurity: ${failed.length}/${results.length} checks failed`);
process.exit(1);
