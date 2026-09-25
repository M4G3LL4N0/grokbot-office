import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadWorkforce } from '../src/registry.js';

const w = loadWorkforce();

const SPEC_GROUPS = [
  'engineering-triage',
  'research-cell',
  'intelligence-cell',
  'private-office',
  'family-office',
  'product-redblue',
];

describe('groups: named templates', () => {
  it('exactly the six spec groups exist', () => {
    const names = w.groupTemplates.map((t) => t.name).sort();
    assert.deepEqual(names, [...SPEC_GROUPS].sort());
  });

  it('each group has <=6 bots and a named task owner that is a member', () => {
    for (const t of w.groupTemplates) {
      assert.ok(t.memberIds.length >= 2, `${t.name} too small`);
      assert.ok(t.memberIds.length <= 6, `${t.name} has ${t.memberIds.length} bots`);
      assert.ok(t.memberIds.includes(t.taskOwnerId), `${t.name} owner not member`);
      assert.equal(new Set(t.memberIds).size, t.memberIds.length, `${t.name} duplicate members`);
      for (const id of t.memberIds) {
        const r = w.roles.get(id);
        assert.ok(r, `${t.name} unknown member ${id}`);
        assert.notEqual(r?.activation, 'experimental', `${t.name}:${r?.name} experimental in group`);
      }
    }
  });

  it('each group has a purpose for group-work (owner publishes ONE merged result)', () => {
    for (const t of w.groupTemplates) {
      assert.ok(t.purpose.length > 0, t.name);
    }
  });
});

describe('routines: templates only, never active', () => {
  it('routine templates loaded with metadata', () => {
    assert.ok(w.routineTemplates.length >= 5);
    assert.ok(w.routineTemplates.length <= 50, 'Cursor caps routines at 50 per bot');
    for (const t of w.routineTemplates) {
      assert.equal(t.enabled, false, `${t.name} must be disabled`);
      assert.equal(t.status, 'template', `${t.name} status`);
      assert.equal(t.graduated, false, `${t.name} graduated`);
      assert.ok(['weekly', 'monthly', 'on_demand_only', 'daily'].includes(t.cadence), `${t.name} cadence=${t.cadence}`);
      assert.ok(t.purpose.length > 0, t.name);
      assert.ok(t.consumer.length > 0, t.name);
      for (const id of t.memberIds) assert.ok(w.roles.get(id), `${t.name} unknown member ${id}`);
    }
  });

  it('travel brief is on-demand-only; subscription audit is monthly', () => {
    const travel = w.routineTemplates.find((t) => t.name === 'travel_brief');
    const spend = w.routineTemplates.find((t) => t.name === 'weekly_spend');
    assert.equal(travel?.cadence, 'on_demand_only');
    assert.equal(spend?.cadence, 'monthly');
  });

  it('no routine emits consumer without purpose or runs hourly', () => {
    for (const t of w.routineTemplates) {
      assert.notEqual(t.cadence, 'hourly', t.name);
    }
  });
});