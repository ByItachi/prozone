#!/usr/bin/env node
// Dependency-free secret scanner for staged changes and the tracked tree.
//
//   node scripts/scan-secrets.mjs --staged     # files staged for commit (pre-commit hook)
//   node scripts/scan-secrets.mjs              # every tracked file
//   node scripts/scan-secrets.mjs --history    # every blob reachable from any ref + commit messages
//   node scripts/scan-secrets.mjs path [path]  # explicit files
//
// Exit codes: 0 = clean, 1 = findings (or a broken repo state), 2 = usage error.
// A line can be exempted with a trailing `secretscan:allow` comment when the
// match is provably not a credential.

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const MAX_BYTES = 1_000_000;

/** Files we never scan: lockfiles, minified bundles, binaries, this script. */
const SKIP_PATH = [
  /^pnpm-lock\.yaml$/,
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
  /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|eot|pdf|zip|gz|webm|mp4|pack)$/i,
  /^scripts\/scan-secrets\.mjs$/,
];

/** Values that only look secret-ish: placeholders, references, test fixtures. */
const ALLOWED_VALUE = [
  /^(|null|undefined|true|false|"",?'?)$/i,
  /change[-_]?me/i,
  /placeholder/i,
  /example/i,
  /your[-_ ]?(key|token|secret|password)/i,
  /^<.*>$/,
  /^\$\{.*\}$/,
  /^x{3,}$/i,
  /^\.{3,}$/,
  /^(todo|fixme|dummy|fake|sample|test)$/i,
  /^process\.env/,
  /^env\./,
];

const RULES = [
  // Hard provider formats: no placeholder heuristics, these are unambiguous.
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'aws-access-key', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { id: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'stripe-live-key', re: /\b(sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'openai-key', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },

  // Credentials assigned as literals in code.
  {
    id: 'hardcoded-credential',
    re: /(password|passwd|pwd|secret|token|api[_-]?key|private[_-]?key|access[_-]?key)["']?\s*[:=]\s*["'`]([^"'`\n]{8,})["'`]/i,
    minValue: 8,
    ignoreCaseKey: true,
  },

  // KEY=value in committed env templates (.env.example and friends).
  {
    id: 'env-template-credential',
    re: /^\s*[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY|PWD)[A-Z0-9_]*\s*=\s*(\S{8,})\s*$/,
    envTemplatesOnly: true,
  },

  // Regression guard: values that already leaked in this repository. Assembled from
  // fragments on purpose — the repository must not contain a literal copy of them.
  {
    id: 'known-leaked-value',
    re: new RegExp(`(${['Prozone' + 'Test' + '123' + '!', 'Admin' + '1234' + '!'].join('|')})`),
  },
];

const ENV_TEMPLATE = /(^|\/)\.env\.(example|sample|template)$/;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

function stagedFiles() {
  const out = git(['diff', '--cached', '--name-only', '--diff-filter=ACM', '-z']);
  return out.split('\0').filter(Boolean);
}

function trackedFiles() {
  return git(['ls-files', '-z']).split('\0').filter(Boolean);
}

function isSkipped(path) {
  return SKIP_PATH.some((re) => re.test(path));
}

function shouldSkipValue(value) {
  const trimmed = value.trim().replace(/[,;]+$/, '');
  if (trimmed.length < 6) return true;
  return ALLOWED_VALUE.some((re) => re.test(trimmed));
}

function mask(secret) {
  const s = secret.trim();
  if (s.length <= 8) return '*'.repeat(s.length);
  return `${s.slice(0, 3)}…${s.slice(-2)} (${s.length} chars)`;
}

function scanContent(path, content) {
  const findings = [];
  if (content.includes('\0')) return findings;

  const isEnvTemplate = ENV_TEMPLATE.test(path);
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.includes('secretscan:allow')) return;

    for (const rule of RULES) {
      if (rule.envTemplatesOnly && !isEnvTemplate) continue;
      const match = rule.re.exec(line);
      if (!match) continue;

      const value = match[2] ?? match[0];
      if (rule.id !== 'private-key' && shouldSkipValue(value)) continue;

      findings.push({ path, line: index + 1, rule: rule.id, sample: mask(value) });
      break;
    }
  });

  return findings;
}

function scanFile(path) {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return []; // deleted between listing and reading
  }
  if (!stats.isFile() || stats.size > MAX_BYTES) return [];

  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return []; // binary or unreadable
  }
  return scanContent(path, content);
}

/** Every distinct blob reachable from any ref, plus every commit message. */
function scanHistory() {
  const findings = [];
  const seen = new Set();
  const commits = git(['log', '--all', '--pretty=format:%H']).split('\n').filter(Boolean);

  for (const sha of commits) {
    const short = sha.slice(0, 7);
    const message = git(['log', '-1', '--pretty=format:%B', sha]);
    findings.push(...scanContent(`commit ${short} message`, message));

    const entries = git(['ls-tree', '-r', '-l', '-z', sha]).split('\0').filter(Boolean);
    for (const entry of entries) {
      const meta = entry.split('\t');
      if (meta.length < 2) continue;
      const parsed = /^(\d+) (\w+) ([0-9a-f]{40})\s+(\d+)$/.exec(meta[0]);
      if (!parsed || parsed[2] !== 'blob') continue;
      const blobSha = parsed[3];
      const size = Number(parsed[4]);

      const path = meta[1];
      if (isSkipped(path)) continue;
      if (size > MAX_BYTES) continue;
      if (seen.has(blobSha)) continue;
      seen.add(blobSha);

      let content;
      try {
        content = git(['cat-file', 'blob', blobSha]);
      } catch {
        continue; // binary blob
      }
      for (const found of scanContent(path, content)) {
        findings.push({ ...found, path: `${path} @${short}` });
      }
    }
  }

  return findings;
}

function isCommittedSecretFile(path) {
  if (ENV_TEMPLATE.test(path)) return false;
  return /(^|\/)\.env(\.|$)/.test(path) || /(^|\/)(id_rsa|id_ed25519|credentials\.json)$/.test(path);
}

function main() {
  const args = process.argv.slice(2);
  const staged = args.includes('--staged');
  const history = args.includes('--history');
  const explicit = args.filter((a) => !a.startsWith('--'));

  if (history) {
    const findings = scanHistory();
    if (findings.length === 0) {
      console.log('scan-secrets: no findings in reachable git history.');
      process.exit(0);
    }
    console.error(`scan-secrets: ${findings.length} potential secret(s) in git history:`);
    for (const f of findings.slice(0, 50)) {
      console.error(`  - ${f.path}  [${f.rule}]  ${f.sample}`);
    }
    if (findings.length > 50) console.error(`  … and ${findings.length - 50} more`);
    console.error('\nHistory rewrite is required to remove these (see docs/security-credential-remediation.md).');
    process.exit(1);
  }

  let files;
  if (explicit.length > 0) {
    files = explicit;
  } else {
    try {
      files = staged ? stagedFiles() : trackedFiles();
    } catch (error) {
      console.error(`scan-secrets: unable to list files (${error.message.split('\n')[0]})`);
      process.exit(1);
    }
  }

  const findings = files
    .filter((f) => !isSkipped(f))
    .flatMap((f) => {
      const found = scanFile(f);
      if (isCommittedSecretFile(f)) {
        found.unshift({ path: f, line: 0, rule: 'committed-env-file', sample: 'whole file' });
      }
      return found;
    });

  if (findings.length === 0) {
    console.log(`scan-secrets: no findings in ${files.length} file(s)${staged ? ' (staged)' : ''}.`);
    process.exit(0);
  }

  console.error(`scan-secrets: ${findings.length} potential secret(s) found:`);
  for (const f of findings) {
    const where = f.line > 0 ? `${f.path}:${f.line}` : f.path;
    console.error(`  - ${where}  [${f.rule}]  ${f.sample}`);
  }
  console.error('\nRemove the value (use an environment variable), or add a `secretscan:allow` comment if it is a known false positive.');
  process.exit(1);
}

main();
