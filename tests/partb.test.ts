import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadWorkforce } from '../src/registry.js';
import { bootstrapBodies, writeBootstrap, verifyChecksums, WAVE2_ORDER } from '../src/bootstrap.js';
import { a2aSmokeTest, A2A_SMOKE_SPEC } from '../src/a2a-smoke.js';
import { shouldCreateDecision, writeMaterializationStatus } from '../src/materialization.js';

const w = loadWorkforce();

const body = (rel: string): string =>
  bootstrapBodies(w).find((b) => b.rel === rel)?.content ?? '';

describe('part B: activation package files exist', () => {
  it('adds the six new deliverable docs to the package', () => {
    const rels = bootstrapBodies(w).map((b) => b.rel);
    for (const rel of [
      'ACTIVATE_NOW.md',
      'WAVE2_QUEUE.md',
      'LIVE_ROSTER.md',
      'SETUP_GROKBOT_COMPUTER.md',
      'SPECIALIST_CREATION_POLICY.md',
      'A2A_SMOKE_TEST.md',
    ]) {
      assert(rels.includes(rel), `${rel} must be part of the bootstrap package`);
    }
  });

  it('ACTIVATE_NOW is a one-screen 10-step guide naming only the wave-1 trio', () => {
    const content = body('ACTIVATE_NOW.md');
    assert.match(content, /^# ACTIVATE NOW — one screen, 10 steps/im);
    assert.match(content, /10\. \*\*STOP\.\*\*/);
    assert.match(content, /ChiefOfStaff, IntelligenceChief, ProjectsChief/);
    assert.match(content, /materialize:set 01 live_verified/);
    assert.match(content, /bootstrap:set wave1_verified --confirm/);
    assert.doesNotMatch(content, /RealityAuditor/);
  });

  it('new docs carry no credentials or private references', () => {
    for (const rel of ['ACTIVATE_NOW.md', 'WAVE2_QUEUE.md', 'LIVE_ROSTER.md', 'SETUP_GROKBOT_COMPUTER.md', 'SPECIALIST_CREATION_POLICY.md', 'A2A_SMOKE_TEST.md']) {
      const content = body(rel);
      assert.doesNotMatch(content, /(sk-[A-Za-z0-9]|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i, `${rel} no credentials`);
    }
  });
});

describe('part B: wave-2 creation queue', () => {
  it('follows the mission order and gates PrivateChiefOfStaff last', () => {
    assert.deepEqual([...WAVE2_ORDER], ['08', '06', '07', '09', '10', '04', '05', '43']);
    const content = body('WAVE2_QUEUE.md');
    const positions = WAVE2_ORDER.map((id) => content.indexOf(`### ${id} — `));
    assert.ok(positions.every((p) => p >= 0), 'every wave-2 role must have a section');
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'sections must appear in mission order');
    assert.match(content, /CREATION GATE: real personal-office demand only/);
    assert.match(content, /usage band ≤ CONSERVE_LIGHT/);
  });

  it('each queue entry explains why the role earns persistence', () => {
    const content = body('WAVE2_QUEUE.md');
    assert.match(content, /Why it earns persistence: Truth-check gate/);
    assert.match(content, /Repeated work IS the recurring-value signal/);
    assert.match(content, /Institutional\/personal memory is persistent by nature/);
  });
});

describe('part B: live roster', () => {
  it('starts with three wave-1 roles and counts the rest virtual', () => {
    const content = body('LIVE_ROSTER.md');
    for (const [id, name] of [['01', 'ChiefOfStaff'], ['02', 'IntelligenceChief'], ['03', 'ProjectsChief']]) {
      assert.match(content, new RegExp(`\\| ${id} \\| ${name} \\| (?:LIVE \\(verified\\)|PENDING)`));
    }
    assert.match(content, /all other 131 roles \| registry-only \/ virtual/);
    assert.match(content, /materialize:set <id> live_verified/);
  });
});

describe('part B: specialist creation policy', () => {
  it('states chiefs run the specialty first and lists durable-bot triggers', () => {
    const content = body('SPECIALIST_CREATION_POLICY.md');
    assert.match(content, /chiefs run the specialty first/i);
    assert.match(content, /recurring work/i);
    assert.match(content, /durable context/i);
    assert.match(content, /distinct tools\/session/i);
    assert.match(content, /different approval boundary/i);
    assert.match(content, /parallel workload/i);
    assert.match(content, /TEMPORARY ROLE/i);
  });
});

describe('part B: A2A smoke test (native)', () => {
  it('both responders round-trip the exact mission TASK line', () => {
    const results = a2aSmokeTest(w);
    assert.equal(results.length, 2);
    for (const r of results) {
      assert.equal(r.pass, true, `${r.responder} smoke must pass`);
      assert.equal(r.taskRoundTrip, true);
      assert.equal(r.resultRoundTrip, true);
      assert.equal(r.hierarchyMatches, true);
      assert.ok(r.hierarchyFacts.some((f) => f === 'parent=ChiefOfStaff'));
    }
  });

  it('mission spec lines are the exact expected strings', () => {
    assert.equal(
      A2A_SMOKE_SPEC[0]!.taskLine,
      'TASK|ChiefOfStaff→ProjectsChief|confirm hierarchy|none|no external action|return parent+role in one line',
    );
    assert.equal(
      A2A_SMOKE_SPEC[1]!.taskLine,
      'TASK|ChiefOfStaff→IntelligenceChief|confirm hierarchy|none|no external action|return parent+role in one line',
    );
  });

  it('canonical RESULT uses numeric confidence (what the parser accepts)', () => {
    const results = a2aSmokeTest(w);
    for (const r of results) {
      assert.match(r.canonicalResultLine, /\|none\|1\|none$/);
      assert.doesNotMatch(r.canonicalResultLine, /\|high\|/);
    }
  });
});

describe('part B: usage-aware should-create codes at 79%', () => {
  it('wave-1 core trio → CREATE_NOW', () => {
    for (const id of ['01', '02', '03']) {
      const d = shouldCreateDecision(w, id);
      assert.equal(d.code, 'CREATE_NOW', `${id} must be CREATE_NOW`);
    }
  });

  it('looser-band core chiefs → DEFER_UNTIL_RESET', () => {
    for (const id of ['04', '05', '06', '07', '08', '09', '10']) {
      const d = shouldCreateDecision(w, id);
      assert.equal(d.code, 'DEFER_UNTIL_RESET', `${id} (${d.name}) must be DEFER_UNTIL_RESET`);
    }
  });

  it('specialists and private office → USE_TEMPORARY_ROLE', () => {
    for (const id of ['16', '43', '126']) {
      const d = shouldCreateDecision(w, id);
      assert.equal(d.code, 'USE_TEMPORARY_ROLE', `${id} (${d.name}) must be USE_TEMPORARY_ROLE`);
    }
  });

  it('codeDescription exists for every code', () => {
    for (const id of ['01', '02', '03', '06', '16']) {
      const d = shouldCreateDecision(w, id);
      assert(d.codeDescription.length > 0);
    }
  });

  it('a role awaiting human verification → NEEDS_HUMAN_APPROVAL', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-b-'));
    writeMaterializationStatus(tmp, '06', 'live_unverified');
    const d = shouldCreateDecision(w, '06', tmp);
    assert.equal(d.code, 'NEEDS_HUMAN_APPROVAL');
  });

  it('already live_verified → CREATE_NOW (no duplication), verdict stays exists', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-b-'));
    writeMaterializationStatus(tmp, '01', 'live_verified');
    const d = shouldCreateDecision(w, '01', tmp);
    assert.equal(d.verdict, 'exists');
    assert.equal(d.code, 'CREATE_NOW');
  });
});

describe('part B: package remains deterministic with the new files', () => {
  it('writeBootstrap stays byte-identical across runs and verifiable', () => {
    const a = mkdtempSync(join(tmpdir(), 'grok-pb-'));
    const b = mkdtempSync(join(tmpdir(), 'grok-pb-'));
    const p1 = writeBootstrap(w, a);
    const p2 = writeBootstrap(w, b);
    assert.equal(p1.totalBytes, p2.totalBytes);
    assert.deepEqual(
      p1.files.map((f) => [f.rel, f.bytes, f.sha256]),
      p2.files.map((f) => [f.rel, f.bytes, f.sha256]),
    );
    assert.equal(p1.checksumsVerified, true);
    assert.equal(verifyChecksums(a), true);
    assert.ok(p1.files.length > 10, 'package must carry the six new Part B docs');
  });
});