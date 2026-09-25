import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadWorkforce } from '../src/registry.js';
import {
  shouldCreateDecision,
  writeMaterializationStatus,
} from '../src/materialization.js';

const w = loadWorkforce();

describe('should-create: decision favors NOT creating', () => {
  it('a standing chief in the current live core earns a dedicated bot', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-sc0-'));
    const d = shouldCreateDecision(w, '03', tmp); // ProjectsChief, isolated state
    assert.equal(d.verdict, 'create_dedicated_bot');
    assert.ok(d.reasonsFor.some((r) => r.startsWith('standing coordination hub')));
  });

  it('an experimental capability is deferred (never casually created)', () => {
    const d = shouldCreateDecision(w, '126'); // ArtificialCity
    assert.equal(d.verdict, 'defer');
    assert.ok(d.reasonsAgainst.some((r) => r.startsWith('experimental capability')));
    assert.ok(d.reasonsAgainst.some((r) => r.startsWith('USAGE CONSERVE')), 'usage guard must be cited');
    assert.ok(d.pathway.some((s) => s.startsWith('Not now.')));
  });

  it('a dormant specialist defers during CONSERVE and names a chief path', () => {
    const d = shouldCreateDecision(w, '16'); // AutonomousQA
    assert.equal(d.verdict, 'defer');
    assert.match(d.eligibleWhy, /not eligible|state|dormant/i);
    assert.ok(d.temporaryCarrier.length > 0);
  });

  it('an already-live_verified role is reported as exists, never duplicated', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-sc-'));
    writeMaterializationStatus(tmp, '01', 'live_verified');
    const d = shouldCreateDecision(w, '01', tmp);
    assert.equal(d.verdict, 'exists');
    assert.ok(d.pathway[0]!.includes('do not duplicate'));
  });

  it('the reuse-through-chief pathway is always concrete', () => {
    // Force a temporary verdict by checking a highly-sensitive specialist would
    // not casually become its own bot if eligibility existed later.
    const d = shouldCreateDecision(w, '16');
    assert.ok(d.reasonsAgainst.some((r) => r.includes('existing chief')), 'A2A law reason present');
  });
});