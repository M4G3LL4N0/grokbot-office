import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadWorkforce } from '../src/registry.js';
import { isApprovalBoundary, isBudgetClass, isDataClass } from '../registry/schema.js';

const w = loadWorkforce();

describe('registry loads', () => {
  it('contains 134 roles and 3 anchors', () => {
    assert.equal(w.roles.size, 134);
    assert.equal(w.anchors.size, 3);
    for (const a of ['human', 'agentos', 'orgos']) assert.ok(w.anchors.has(a));
  });

  it('has unique ids and unique names', () => {
    const ids = [...w.roles.keys()];
    assert.equal(new Set(ids).size, ids.length);
    const names = [...w.roles.values()].map((r) => r.name);
    assert.equal(new Set(names).size, names.length);
  });

  it('ever role resolves a parent to a known role or anchor', () => {
    for (const r of w.roles.values()) {
      const p = w.parent.get(r.id);
      assert.ok(p !== undefined, `${r.id} missing parent link`);
      assert.ok(
        w.roles.has(p) || w.anchors.has(p),
        `${r.id} (${r.name}) parent ${p} is neither a role nor an anchor`,
      );
    }
  });

  it('span includes both extremes (ChiefOfStaff + GrokBotEcosystemScout)', () => {
    assert.ok(w.roles.has('01'));
    assert.ok(w.roles.has('134'));
  });

  it('derived fields are populated for all roles', () => {
    for (const r of w.roles.values()) {
      assert.ok(isBudgetClass(r.budgetClass), `${r.id} budgetClass`);
      assert.ok(isApprovalBoundary(r.approvalBoundary), `${r.id} approvalBoundary`);
      assert.ok(isDataClass(r.dataClass), `${r.id} dataClass`);
      assert.ok(r.maxHandoffs >= 1, `${r.id} maxHandoffs`);
      assert.ok(Array.isArray(r.allowedPeers), `${r.id} peers`);
      assert.ok(Array.isArray(r.groupCandidates), `${r.id} groups`);
      assert.ok(Array.isArray(r.tags) && r.tags.length >= 3, `${r.id} tags`);
      assert.ok(r.title.length > 0, `${r.id} title empty`);
    }
    assert.equal(w.roles.get('01')?.title, 'Chief of Staff');
    assert.equal(w.roles.get('43')?.title, 'Private Chief of Staff');
    assert.equal(w.roles.get('11')?.title, 'Repo Census');
  });

  it('chief-of-staff chain and family-office chain resolve', () => {
    const cfo = w.roles.get('57')!;
    assert.equal(cfo.name, 'FamilyCFO');
    assert.equal(w.parent.get('57'), '05');
    assert.equal(w.parent.get('58'), '57');
  });

  it('security policy marks sensitive family roles highly_sensitive', () => {
    assert.equal(w.roles.get('83')?.dataClass, 'highly_sensitive'); // FamilyOfficeDataRoom
    assert.equal(w.roles.get('68')?.dataClass, 'highly_sensitive'); // InsuranceRiskManager
    assert.equal(w.roles.get('49')?.dataClass, 'confidential'); // PersonalPurchasingAgent
  });

  it('approval overrides apply', () => {
    assert.equal(w.roles.get('49')?.approvalBoundary, 'human_approval'); // purchasing
    assert.equal(w.roles.get('61')?.approvalBoundary, 'human_approval'); // diligence
    assert.equal(w.roles.get('20')?.approvalBoundary, 'internal_write'); // documentation
  });

  it('routines/groups references resolve (loader throws otherwise)', () => {
    // loader already resolves; re-derive expectations
    const deep = w.roles.get('29')!;
    assert.ok(deep.routineCandidates.includes('115') === false); // no hardcoded guarantee, just loadability
    assert.ok(w.roles.get('10')!.routineCandidates.includes('51')); // CostOptimizer + SubscriptionAuditor share quarterly_office
  });
});