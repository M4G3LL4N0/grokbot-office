// GrokBot Office — repository bridge (Part 4).
// bridge:check  — read-only readiness report: can this subtree be shared to a
//                 GrokBot cloud computer via a private Git repo without leaking
//                 local state, credentials, or private documents? NEVER alters
//                 the remote, NEVER pushes, NEVER contacts GrokBot.
// bridge:bundle — build generated/grokbot-bootstrap.tar.gz (bootstrap package +
//                 necessary non-secret docs) + a manifest. Local-only artifact.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';

import { ROOT } from './paths.js';
import type { Workforce } from './registry.js';
import { writeBootstrap } from './bootstrap.js'; import type { BootstrapBody } from './bootstrap.js';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface BridgeCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface BridgeReport {
  checks: BridgeCheck[];
  verdict: 'READY' | 'NOT_READY';
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function git(root: string, args: string[]): { ok: boolean; lines: string[]; error: string } {
  try {
    const stdout = execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 10_000_000 });
    return { ok: true, lines: stdout.split('\n').filter(Boolean), error: '' };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const detail = (err.stderr ?? err.message ?? '').toString().trim().split('\n')[0] ?? 'git error';
    return { ok: false, lines: (err.stdout ?? '').toString().split('\n').filter(Boolean), error: detail };
  }
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'generated', 'state', '.git', 'coverage']);
const TEXT_EXT = new Set(['.ts', '.js', '.mjs', '.json', '.yaml', '.yml', '.md', '.txt', '.toml', '.tsv', '.csv', '.gitignore', '.tsconfig', '.svg', '.html', '.env.example']);
const SENSITIVE_FILE_EXT = new Set(['.pdf', '.xlsx', '.xls', '.ofx', '.qfx', '.doc', '.docx', '.bank', '.jpg', '.jpeg', '.png']);
const RAW_DOC_HINT = /(bank|statement|tax|will|trust|passport|brokerage|insurance|medical|401k|finances?|statement|notary|deed|title)/i;

/** Walk the grokbot-office subtree; skip build/vendor/sensitive-output dirs. */
export function walkFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const abs = join(dir, name);
      const relP = relative(root, abs);
      let st: { isDirectory(): boolean };
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        walk(abs);
      } else {
        out.push(relP);
      }
    }
  };
  walk(root);
  return out.sort();
}

export const isTextFile = (rel: string): boolean => {
  const ext = '.' + rel.split('.').slice(1).join('.');
  return TEXT_EXT.has(ext.toLowerCase());
};

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'OpenAI key', re: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Cursor/GrokBot key', re: /\bcrsr_[A-Za-z0-9]{20,}/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{20,}/ },
  { name: 'Stripe live key', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/ },
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    name: 'inline credential assignment',
    re: /\b(?:api[_-]?key|secret|password|passwd|access[_-]?token|refresh[_-]?token|authorization)\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{12,}/i,
  },
];

export function scanSecrets(root: string): Array<{ file: string; line: number; kind: string }> {
  const found: Array<{ file: string; line: number; kind: string }> = [];
  for (const rel of walkFiles(root)) {
    if (!isTextFile(rel) && basename(rel) !== '.gitignore') continue;
    if (basename(rel) === '.env') continue; // flagged separately by envFiles()
    if (basename(rel).endsWith('.env.example')) continue;
    let content: string;
    try {
      content = readFileSync(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const p of SECRET_PATTERNS) {
        if (p.re.test(line)) {
          found.push({ file: rel, line: i + 1, kind: p.name });
          break;
        }
      }
    }
  }
  return found;
}

export function envFiles(root: string): string[] {
  return walkFiles(root).filter((f) => basename(f) === '.env' || /^\.env\.[^.]+$/.test(basename(f)));
}

/** Files that look like copied private documents (statements, tax, medical, etc.). */
export function sensitiveDocuments(root: string): string[] {
  return walkFiles(root).filter((f) => RAW_DOC_HINT.test(basename(f)) || SENSITIVE_FILE_EXT.has('.' + (f.split('.').pop() ?? '').toLowerCase()));
}

/* ------------------------------------------------------------------ */
/* bridge:check                                                        */
/* ------------------------------------------------------------------ */

export function bridgeCheck(root = ROOT): BridgeReport {
  const checks: BridgeCheck[] = [];

  const gitTop = git(root, ['rev-parse', '--show-toplevel']);
  if (!gitTop.ok) {
    checks.push({ name: 'git repo', status: 'fail', detail: `no git repo detected: ${gitTop.error}` });
  } else {
    const top = gitTop.lines[0] ?? '';
    checks.push({ name: 'git repo', status: 'pass', detail: `in repository: ${top}` });

    const st = git(root, ['status', '--porcelain', '--', '.']);
    const untracked = st.lines.filter((l) => l.startsWith('?? ')).length;
    checks.push(
      untracked > 0
        ? { name: 'subtree tracked', status: 'warn', detail: `${untracked} untracked path(s): the grokbot-office subtree is NOT committed yet. Commit after review (never push).` }
        : { name: 'subtree tracked', status: 'pass', detail: 'no untracked paths in this subtree' },
    );

    const remotes = git(root, ['remote', '-v']).lines;
    checks.push(
      remotes.length > 0
        ? { name: 'git remote', status: 'warn', detail: `remote present (${remotes[0]?.split('\t')[0] ?? '?'}). Never push via this CLI; share via a dedicated private repo if the human chooses.` }
        : { name: 'git remote', status: 'pass', detail: 'no remote configured — bridge via private repo or package attach only' },
    );
  }

  const gi = readFileSync(join(root, '.gitignore'), 'utf8').split('\n');
  const ignoresState = gi.some((l) => l.trim().startsWith('state'));
  const ignoresGenerated = gi.some((l) => l.trim().startsWith('generated'));
  checks.push(
    ignoresState && ignoresGenerated
      ? { name: 'local state ignored', status: 'pass', detail: '.gitignore covers state/ and generated/' }
      : { name: 'local state ignored', status: 'fail', detail: `.gitignore must ignore state/ and generated/ (state=${ignoresState}, generated=${ignoresGenerated})` },
  );

  const envs = envFiles(root);
  checks.push(
    envs.length === 0
      ? { name: 'no .env files', status: 'pass', detail: 'no .env/.env.* files in subtree (env.example allowed)' }
      : { name: 'no .env files', status: 'fail', detail: `found: ${envs.join(', ')}` },
  );

  const leaks = scanSecrets(root);
  checks.push(
    leaks.length === 0
      ? { name: 'no credentials', status: 'pass', detail: 'no likely API keys / credentials in text files' }
      : { name: 'no credentials', status: 'fail', detail: leaks.slice(0, 5).map((l) => `${l.file}:${l.line} (${l.kind})`).join(', ') + (leaks.length > 5 ? ` …${leaks.length - 5} more` : '') },
  );

  const sensDocs = sensitiveDocuments(root);
  checks.push(
    sensDocs.length === 0
      ? { name: 'no private documents', status: 'pass', detail: 'no copied bank/statement/tax/medical-type documents in subtree' }
      : { name: 'no private documents', status: 'warn', detail: `review before sharing: ${sensDocs.slice(0, 5).join(', ')}${sensDocs.length > 5 ? ' …' : ''}` },
  );

  const verdict: BridgeReport['verdict'] = checks.some((c) => c.status === 'fail') ? 'NOT_READY' : 'READY';
  return { checks, verdict };
}

/* ------------------------------------------------------------------ */
/* bridge:bundle                                                       */
/* ------------------------------------------------------------------ */

/** Public, non-secret documents safe to bundle for a GrokBot cloud computer. */
export const BUNDLE_DOCS: Array<{ rel: string; src: string }> = [
  { rel: 'README.md', src: 'README.md' },
  { rel: 'QUICKSTART.md', src: 'QUICKSTART.md' },
  { rel: 'ARCHITECTURE.md', src: 'ARCHITECTURE.md' },
  { rel: 'SECURITY.md', src: 'SECURITY.md' },
  { rel: 'OFFLINE.md', src: 'OFFLINE.md' },
  { rel: 'STATUS.md', src: 'STATUS.md' },
  { rel: 'FAQ.md', src: 'FAQ.md' },
  { rel: 'examples/README.md', src: join('examples', 'README.md') },
];

export interface BundleManifest {
  generatedAt: string;
  archivePath: string;
  archiveBytes: number;
  archiveSha256: string;
  fileCount: number;
  files: Array<{ path: string; bytes: number; sha256: string }>;
}

export const bundleTarPath = (root = ROOT): string => join(root, 'generated', 'grokbot-bootstrap.tar.gz');
export const bundleManifestPath = (root = ROOT): string => join(root, 'generated', 'grokbot-bootstrap-manifest.json');

/**
 * Stage the bootstrap package + doc set and tar.gz them deterministically.
 * Returns nothing written outside staging; the archive + manifest are returned.
 */
export function stageBundle(w: Workforce, root: string, stageDir: string, includeDocs: boolean): Array<{ path: string; bytes: number }> {
  const boot = join(stageDir, 'bootstrap');
  const pkg = writeBootstrap(w, boot);
  const entries: Array<{ path: string; bytes: number }> = [];
  for (const f of pkg.files) {
    entries.push({ path: join('bootstrap', f.rel), bytes: f.bytes });
  }
  if (includeDocs) {
    for (const d of BUNDLE_DOCS) {
      const src = join(root, d.src);
      if (!existsSync(src)) continue;
      const bytes = readFileSync(src);
      const dest = join(stageDir, d.rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, bytes);
      entries.push({ path: d.rel, bytes: bytes.length });
    }
  }
  return entries;
}

const TAR_EPOCH = new Date('2000-01-01T00:00:00Z');

function pinStagedMtimes(stageDir: string, relPaths: string[]): void {
  for (const rel of relPaths) {
    const p = join(stageDir, rel);
    try {
      utimesSync(p, TAR_EPOCH, TAR_EPOCH);
    } catch {
      // directory or vanished file: ignore, tar enumerates what exists
    }
  }
}

export function tarStage(stageDir: string, outPath: string, relPaths: string[]): void {
  const sorted = [...relPaths].sort((a, b) => a.localeCompare(b));
  mkdirSync(dirname(outPath), { recursive: true });
  pinStagedMtimes(stageDir, sorted);
  try {
    execFileSync('tar', ['-czf', outPath, '-C', stageDir, ...sorted, '--mtime=2000-01-01 00:00:00Z', '--uid=0', '--gid=0'], { stdio: 'pipe' });
    return;
  } catch {
    // GNU-flag variant unsupported (macOS bsdtar): fall through to portable path.
  }
  const raw = mkdtempSync(join(tmpdir(), 'grokbot-tar-'));
  const rawTar = join(raw, 'bundle.tar');
  execFileSync('tar', ['-cf', rawTar, '-C', stageDir, ...sorted], { stdio: 'pipe' });
  const gz = execFileSync('gzip', ['-n', '-c', rawTar]);
  writeFileSync(outPath, gz);
}


export function bridgeBundle(w: Workforce, root = ROOT): { tar: string; manifest: string; report: BundleManifest } {
  const stage = mkdtempSync(join(tmpdir(), 'grokbot-bridge-'));
  const entries = stageBundle(w, root, stage, true);

  const relPaths = entries.map((e) => e.path);
  const tarPath = bundleTarPath(root);
  tarStage(stage, tarPath, relPaths);

  const archiveBytes = readFileSync(tarPath).length;
  const archiveSha256 = createHash('sha256').update(readFileSync(tarPath)).digest('hex');
  const manifest: BundleManifest = {
    generatedAt: new Date().toISOString(),
    archivePath: relative(root, tarPath),
    archiveBytes,
    archiveSha256,
    fileCount: relPaths.length,
    files: entries
      .map((e) => ({ path: e.path, bytes: e.bytes, sha256: createHash('sha256').update(readFileSync(join(stage, e.path))).digest('hex') }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };

  const manifestPath = bundleManifestPath(root);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return { tar: tarPath, manifest: manifestPath, report: manifest };
}

/* ------------------------------------------------------------------ */
/* bridge:check convenience summaries                                  */
/* ------------------------------------------------------------------ */

export function formatBridgeReport(r: BridgeReport): string {
  const lines = r.checks.map((c) => `  [${c.status.toUpperCase()}] ${c.name}: ${c.detail}`);
  lines.push(`  VERDICT: ${r.verdict}`);
  return lines.join('\n');
}

export function bootstrapBodiesFromDir(dir: string): BootstrapBody[] {
  return readdirSync(dir)
    .filter((f) => f !== 'SHA256SUMS.txt')
    .map((f) => ({ rel: f, content: readFileSync(join(dir, f), 'utf8') }))
    .sort((a, b) => a.rel.localeCompare(b.rel));
}