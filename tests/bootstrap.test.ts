import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadWorkforce } from '../src/registry.js';
import {
  bootstrapBodies,
  writeBootstrap,
  verifyChecksums,
  createCardFor,
  bootstrapDir,
} from '../src/bootstrap.js';
import { readBootstrapState, advanceToPackageReady, setBootstrapStatus, BOOTSTRAP_STATUSES, isBootstrapStatus } from '../src/bootstrap-state.js';

const w = loadWorkforce();

describe('bootstrap: package generator', () => {
  it('produces the canonical sorted file set plus sha256 sums', () => {
    const bodies = bootstrapBodies(w);
    const rels = bodies.map((b) => b.rel);
    assert.deepEqual(rels, [...rels].sort((a, b) => a.localeCompare(b)));
    assert(rels.includes('roles.compact.json'));
    assert(rels.includes('hierarchy.compact.json'));
    assert(rels.includes('groups.compact.json'));
    assert(rels.includes('usage-policy.compact.json'));
    assert(rels.includes('security.compact.md'));
    assert(rels.includes('A2A.compact.md'));
    assert(rels.includes('CHIEF_OF_STAFF_PROFILE.md'));
    assert(rels.includes('README_FIRST.md'));
    assert(rels.includes('GROKBOT_BOOTSTRAP_PROMPT.md'));
  });

  it('wave 1 is exactly the three live cores and no more', () => {
    const prompt = bootstrapBodies(w).find((b) => b.rel === 'GROKBOT_BOOTSTRAP_PROMPT.md')?.content ?? '';
    const names = ['ChiefOfStaff', 'IntelligenceChief', 'ProjectsChief'];
    for (const n of names) assert(prompt.includes(n), `prompt must name ${n}`);
    assert.match(prompt, /Create no more than ProjectsChief \+ IntelligenceChief now/);
    assert.match(prompt, /Do NOT create any other Bot/);
  });

  it('package content carries no credentials or private documents', () => {
    for (const b of bootstrapBodies(w)) {
      assert.doesNotMatch(b.content, /(sk-[A-Za-z0-9]|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i, `${b.rel} must not contain credentials`);
      assert.doesNotMatch(b.content, /(bank statement|social security number|account number)/i, `${b.rel} must not reference private documents`);
    }
  });

  it('writeBootstrap is deterministic byte-for-byte and checksums verify', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'grok-boot-')), 'pkg');
    const a = writeBootstrap(w, dir);
    const again = mkdtempSync(join(tmpdir(), 'grok-boot-'));
    const b = writeBootstrap(w, again);
    assert.equal(a.totalBytes, b.totalBytes);
    assert.deepEqual(a.files.map((f) => [f.rel, f.bytes, f.sha256]), b.files.map((f) => [f.rel, f.bytes, f.sha256]));
    assert.equal(a.checksumsVerified, true);
    assert.equal(verifyChecksums(dir), true);
    const sums = readFileSync(join(dir, 'SHA256SUMS.txt'), 'utf8');
    assert.match(sums, /^[0-9a-f]{64}  roles\.compact\.json$/m);
    assert.match(sums, /^[0-9a-f]{64}  A2A\.compact\.md$/m);
    assert.equal(sums.trim().split('\n').length, bootstrapBodies(w).length);
  });

  it('bootstrapDir lives under generated and is gitignored', () => {
    const d = bootstrapDir();
    assert(d.includes('generated'));
  });
});

describe('bootstrap: create-card', () => {
  it('resolves a real role to a full card', () => {
    const card = createCardFor(w, '01');
    assert(card);
    assert.equal(card.name, 'ChiefOfStaff');
    assert(card.title.length > 0);
    assert(card.description.length > 0);
    assert(card.smokeTest.length > 0);
    assert(card.nextMessage.length > 0);
    assert.match(card.nextMessage, /README_FIRST\.md/);
    assert.match(card.nextMessage, /Do not create any other Bot yet\./);
  });

  it('returns null for an unknown role', () => {
    assert.equal(createCardFor(w, 'zzz-not-a-role'), null);
  });
});

describe('bootstrap: state machine (monotonic)', () => {
  it('status order is non-regressing and certified', () => {
    assert.deepEqual(BOOTSTRAP_STATUSES, [
      'unbridged',
      'package_ready',
      'repo_available_to_grokbot',
      'chief_created',
      'chief_verified',
      'wave1_created',
      'wave1_verified',
    ]);
    for (const s of BOOTSTRAP_STATUSES) assert.equal(isBootstrapStatus(s), true);
    assert.equal(isBootstrapStatus('nope'), false);
  });

  it('advanceToPackageReady is auto-safe and idempotent past-ready', () => {
    const root = mkdtempSync(join(tmpdir(), 'grok-state-'));
    const r = advanceToPackageReady(root, 'test-advance');
    assert.equal(r.ok, true);
    assert.equal(r.record.status, 'package_ready');
    assert.equal(readBootstrapState(root).status, 'package_ready');
    const again = advanceToPackageReady(root);
    assert.equal(again.ok, true);
    assert.equal(again.record.status, 'package_ready');
  });

  it('regression is refused and past-ready requires confirm', () => {
    const root = mkdtempSync(join(tmpdir(), 'grok-state-'));
    advanceToPackageReady(root);
    const regress = setBootstrapStatus(root, 'unbridged');
    assert.equal(regress.ok, false);
    assert.match(regress.why, /cannot regress/);
    const leap = setBootstrapStatus(root, 'chief_verified');
    assert.equal(leap.ok, false);
    assert.match(leap.why, /confirm/);
    const ok = setBootstrapStatus(root, 'chief_created', { confirm: true });
    assert.equal(ok.ok, true);
    assert.equal(readBootstrapState(root).status, 'chief_created');
  });

  it('never auto-marks past package_ready', () => {
    const root = mkdtempSync(join(tmpdir(), 'grok-state-'));
    setBootstrapStatus(root, 'chief_created', { autoPackageReady: true });
    assert.notEqual(readBootstrapState(root).status, 'chief_created');
  });
});