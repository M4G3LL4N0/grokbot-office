import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ROOT } from '../src/paths.js';
import { loadWorkforce } from '../src/registry.js';
import {
  bridgeCheck,
  formatBridgeReport,
  bridgeBundle,
  stageBundle,
  walkFiles,
  isTextFile,
  BUNDLE_DOCS,
  bundleTarPath,
  bundleManifestPath,
} from '../src/bridge.js';

const w = loadWorkforce();

describe('bridge: scan/build helpers', () => {
  it('walkFiles skips generated/state/vendor and always returns clean relative paths', () => {
    const files = walkFiles(ROOT);
    assert(files.includes('src/cli.ts'));
     assert(files.includes('README.md'));
    for (const f of files) {
      assert(!f.startsWith('/'), `absolute path leaked: ${f}`);
      assert(!f.split('/').some((seg) => ['generated', 'state', 'node_modules', '.git'].includes(seg)), `skipped dir leaked: ${f}`);
    }
  });

  it('isTextFile guards the obvious binary exts', () => {
    assert.equal(isTextFile('a.md'), true);
    assert.equal(isTextFile('a.ts'), true);
    assert.equal(isTextFile('a.json'), true);
    assert.equal(isTextFile('a.png'), false);
    assert.equal(isTextFile('a.pdf'), false);
  });
});

describe('bridge: readiness report', () => {
  it('reports READY and a stable verdict line', () => {
    const r = bridgeCheck(ROOT);
    assert.equal(r.verdict, 'READY');
    assert(r.checks.length >= 7);
    const names = r.checks.map((c) => c.name);
    for (const n of ['git repo', 'local state ignored', 'no .env files', 'no credentials', 'no private documents']) {
      assert(names.includes(n), `missing check: ${n}`);
    }
    const text = formatBridgeReport(r);
    assert.match(text, /VERDICT: READY/);
    assert.match(text, /\[PASS\] no credentials/);
  });

  it('every fail check has a human-readable detail', () => {
    const r = bridgeCheck(ROOT);
    for (const c of r.checks) {
      assert(c.name.length > 0);
      assert(c.detail.length > 0);
      assert(['pass', 'warn', 'fail'].includes(c.status));
    }
  });
});

describe('bridge: bundle manifests', () => {
  it('BUNDLE_DOCS every referenced doc exists on disk (no silent drop)', () => {
    for (const d of BUNDLE_DOCS) {
      assert(existsSync(join(ROOT, d.src)), `referenced doc missing: ${d.src}`);
    }
    assert(BUNDLE_DOCS.some((d) => d.rel === 'QUICKSTART.md'));
    assert(!BUNDLE_DOCS.some((d) => d.src.startsWith('docs/')));
  });

  it('stageBundle includes bootstrap package + docs, with relative-only paths', () => {
    const stage = join(mkdtempSync(join(tmpdir(), 'grok-stage-')), 'bundle');
    const entries = stageBundle(w, ROOT, stage, true);
    const paths = entries.map((e) => e.path);
    assert(paths.includes('bootstrap/roles.compact.json'));
    assert(paths.includes('bootstrap/SHA256SUMS.txt'));
    assert(paths.includes('QUICKSTART.md'));
    assert(paths.includes('README.md'));
    for (const p of paths) {
      assert(!p.startsWith('/'), `absolute path leaked into bundle: ${p}`);
      assert(!p.startsWith('..'), `parent traversal in bundle: ${p}`);
    }
  });

  it('bundle artifacts land in generated/ and the manifest verifies', () => {
    const b = bridgeBundle(w, ROOT);
    assert(existsSync(b.tar));
    assert(existsSync(b.manifest));
    assert.equal(b.tar, bundleTarPath(ROOT));
    assert.equal(b.manifest, bundleManifestPath(ROOT));
    const m = JSON.parse(readFileSync(b.manifest, 'utf8'));
    assert.equal(m.fileCount, b.report.fileCount);
    assert.equal(m.archiveSha256, b.report.archiveSha256);
    assert.equal(m.archiveBytes, b.report.archiveBytes);
    assert(m.files.every((f: { path: string }) => !f.path.startsWith('/')), 'manifest must contain relative paths only');
  });
});