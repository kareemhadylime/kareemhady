#!/usr/bin/env node
// Mojibake detector. Reports source files whose Unicode characters
// were stored as Latin-1/CP1252 representations of UTF-8 bytes (e.g.
// `🏛️` re-saved as `ðŸ›ï¸`, `·` as `Â·`).
//
// Background: 2026-05-11 we shipped commit 0b84ebf repairing 315
// mojibake instances across 15 files. This script prevents that class
// of corruption from re-entering the codebase via a pre-commit hook
// (`scripts/hooks/pre-commit`) and an `npm run check:mojibake`
// developer entrypoint.
//
// Usage:
//   node scripts/check-mojibake.mjs                # scan all tracked files
//   node scripts/check-mojibake.mjs FILE [FILE...] # scan specific files (hook mode)
//
// Exit codes:
//   0 = clean
//   1 = mojibake found (offending files + samples printed to stderr)
//   2 = invocation error
//
// Detection: walk each character. When we hit a run of Latin-1/CP1252
// high-range chars (U+0080-U+00FF plus the CP1252-specific U+0150-U+0193,
// U+02C6-U+02DC, U+2013-U+2122, U+20AC, U+203A), treat each char as a
// single byte (with CP1252 mapping for 0x80-0x9F) and attempt to
// re-decode as UTF-8. If the decode succeeds and produces a SHORTER
// non-replacement-char string, it's mojibake.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// CP1252-only mappings for bytes 0x80-0x9F (Latin-1 is identical for the
// rest of the high range).
const CP1252_REV = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F,
};

const HIGH_RE =
  /[-ÿŐ-Ɠˆ-˜–-™€›]+/g;

function charToByte(ch) {
  const u = ch.codePointAt(0);
  if (u < 0x80) return u;
  if (u <= 0xFF) return u;
  if (CP1252_REV[u] != null) return CP1252_REV[u];
  return null;
}

function tryUnmojibake(run) {
  const bytes = [];
  for (const ch of run) {
    const b = charToByte(ch);
    if (b == null) return null;
    bytes.push(b);
  }
  const decoded = Buffer.from(bytes).toString('utf8');
  if (decoded.length >= run.length) return null;
  if (decoded.includes('�')) return null;
  for (const c of decoded) {
    const code = c.codePointAt(0);
    if (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) {
      return null;
    }
  }
  return decoded;
}

// Skip patterns that intentionally contain high-range chars (Arabic,
// French, German, etc.). We only flag runs that DECODE to multi-byte
// UTF-8 — natural-language runs won't.
function scanFile(p) {
  let text;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch {
    return [];
  }
  const hits = [];
  for (const m of text.matchAll(HIGH_RE)) {
    const decoded = tryUnmojibake(m[0]);
    if (decoded != null) {
      // Find the line number
      const before = text.slice(0, m.index ?? 0);
      const line = before.split('\n').length;
      hits.push({ line, mojibake: m[0], decoded });
    }
  }
  return hits;
}

function targetFiles(argv) {
  if (argv.length > 0) return argv.filter(f => fs.existsSync(f));
  // No args → scan tracked text files via `git ls-files`.
  let out;
  try {
    out = execSync('git ls-files', { encoding: 'utf8' });
  } catch (e) {
    console.error('check-mojibake: git ls-files failed:', e.message);
    process.exit(2);
  }
  return out
    .split('\n')
    .filter(Boolean)
    // Skip docs/config — `.md`, `.yml`, `.yaml` legitimately quote
    // mojibake patterns in handoffs and changelogs.
    .filter(f => /\.(ts|tsx|js|jsx|mjs|cjs|json|sql|html|css)$/.test(f))
    .filter(f => {
      try { return fs.statSync(f).isFile(); } catch { return false; }
    });
}

function main() {
  const files = targetFiles(process.argv.slice(2));
  if (files.length === 0) {
    console.log('check-mojibake: nothing to scan.');
    process.exit(0);
  }
  const offenders = [];
  for (const f of files) {
    const hits = scanFile(f);
    if (hits.length > 0) offenders.push({ file: f, hits });
  }
  if (offenders.length === 0) {
    console.log(`check-mojibake: ${files.length} file${files.length === 1 ? '' : 's'} scanned, clean.`);
    process.exit(0);
  }
  // Report.
  console.error('');
  console.error('🚫 MOJIBAKE DETECTED 🚫');
  console.error('');
  console.error('One or more files contain Latin-1/CP1252-encoded Unicode characters.');
  console.error('This is the corruption class we repaired in commit 0b84ebf (2026-05-11).');
  console.error('Re-save the file with UTF-8 encoding before committing.');
  console.error('');
  for (const o of offenders) {
    console.error(`  ${o.file}`);
    for (const h of o.hits.slice(0, 3)) {
      console.error(`    line ${h.line}: ${JSON.stringify(h.mojibake)} → ${JSON.stringify(h.decoded)}`);
    }
    if (o.hits.length > 3) {
      console.error(`    ... and ${o.hits.length - 3} more`);
    }
  }
  console.error('');
  console.error('Fix: open the file in an editor that respects UTF-8 (e.g. VS Code with');
  console.error('"Auto Guess Encoding" off and the status bar showing UTF-8) and re-paste');
  console.error('the corrupted region. Or run a one-shot fixer if you have one staged.');
  console.error('');
  console.error('To bypass the hook for an emergency commit: git commit --no-verify');
  console.error('');
  process.exit(1);
}

main();
