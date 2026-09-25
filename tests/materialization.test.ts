import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadWorkforce, firstSmokeTask } from '../src/registry.js';
import { materializePlan, readMaterialization, writeMaterializationStatus, MATERIALIZATION_STATUSES } from '../src/materialization.js';

const w = loadWorkforce();

describe('materialization: model', () => {
  it('status lifecycle is closed and valid', () => {
    assert.deepEqual(MATERIALIZATION_STATUSES, [
      'registry_only', 'profile_generated', 'live_unverified', 'live_verified', 'paused', 'retired',
    ]);
  });

  it('a profile alone never claims a live bot', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-mat0-'));
    const plan = materializePlan(w, '03', tmp);
    assert.equal(plan.currentStatus, 'registry_only');
    assert.equal(plan.profileGenerated, true);
    assert.equal(plan.creationChannel, 'manual');
    assert.equal(plan.adapterFlag.enabled, false);
  });

  it('live eligibility respects the conservation gate', () => {
    const livePlan = materializePlan(w, '03');
    assert.equal(livePlan.liveEligible, true);
    const expPlan = materializePlan(w, '118');
    assert.equal(expPlan.liveEligible, false);
    assert.match(expPlan.liveEligibleWhy, /dormant|CURRENT|state/i);
  });

  it('plan gives exact manual Cursor UI steps', () => {
    const plan = materializePlan(w, '03');
    const joined = plan.steps.join('\n');
    assert.match(joined, /Cmd\+N/);
    assert.match(joined, /Create new agent/);
    assert.match(joined, /Edit Profile/);
    assert.match(joined, /FIRST_SMOKE_TASK/);
    assert.match(joined, /materialize:set 03 live_verified/);
    assert.ok(plan.steps.length >= 7);
  });

  it('no official creation API is claimed', () => {
    const plan = materializePlan(w, '03');
    assert.match(plan.channelNote, /NO official public bot-creation API/i);
  });
});

describe('materialization: state persistence', () => {
  it('write/read round-trips and rejects bad status, scoped to its own root', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-mat-'));
    const untouched = mkdtempSync(join(tmpdir(), 'grok-mat3-'));
    assert.deepEqual(readMaterialization(tmp), {});
    writeMaterializationStatus(tmp, '03', 'live_verified');
    assert.equal(readMaterialization(tmp)['03'], 'live_verified');
    assert.throws(() => writeMaterializationStatus(tmp, '03', 'nope' as never));
    // writes never leak into a different root
    assert.deepEqual(readMaterialization(untouched), {});
  });

  it('plan reflects newly recorded status', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-mat2-'));
    writeMaterializationStatus(tmp, '03', 'live_unverified');
    const plan = materializePlan(w, '03', tmp);
    assert.equal(plan.currentStatus, 'live_unverified');
  });
});

describe('materialization: smoke tasks', () => {
  it('smoke tasks exist for every role (tier default or override)', () => {
    for (const r of w.roles.values()) {
      const t = firstSmokeTask(w, r);
      assert.ok(t.length > 0, `${r.name} missing smoke task`);
    }
  });

  it('chief overrides apply (wave-1 mission texts)', () => {
    const cos = [...w.roles.values()].find((r) => r.name === 'ChiefOfStaff')!;
    assert.match(firstSmokeTask(w, cos), /Return your role, escalation path and current usage constraint in <=5 lines\. Take no external action\./);
    const ic = [...w.roles.values()].find((r) => r.name === 'IntelligenceChief')!;
    assert.match(firstSmokeTask(w, ic), /Do no research\./);
    const pc = [...w.roles.values()].find((r) => r.name === 'ProjectsChief')!;
    assert.match(firstSmokeTask(w, pc), /who you report to in <=4 lines/);
  });
});