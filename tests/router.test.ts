import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { routeTask } from '../src/routing.js';
import { loadWorkforce } from '../src/registry.js';

const w = loadWorkforce();
const name = (d: { owner: { name: string }; specialist: { name: string } | null }) => d.owner.name;

describe('router: spec examples', () => {
  it('audit PAIOS docs → ProjectsChief + DocumentationKeeper', () => {
    const d = routeTask(w, 'audit PAIOS docs');
    assert.equal(name(d), 'ProjectsChief');
    assert.equal(d.specialist?.name, 'DocumentationKeeper');
    assert.equal(d.matchedRule, 'docs/documentation/audit docs/readme drift');
    assert.deepEqual(d.escalation.at(-1), 'human');
    assert.equal(d.ownerLive, true); // 03 is in CONSERVE core
    assert.equal(d.blocked, false);
  });

  it('research weird new capabilities → IntelligenceChief (capability rule wins over research)', () => {
    const d = routeTask(w, 'research weird new capabilities');
    assert.equal(name(d), 'IntelligenceChief');
    assert.equal(d.matchedRule, 'capability/capabilities/weird/new ability/unknown-unknown');
    assert.equal(d.specialist?.name, 'CapabilityScout');
    assert.equal(d.band.label, 'CONSERVE');
    assert.equal(d.proactiveDisabled, true); // 79% used: no proactive scanning
    assert.equal(d.ownerLive, true);
    assert.equal(d.groupJustified, false); // CONSERVE: groups never
    assert.equal(d.maxSpecialistsPerRequest, 1);
    assert.equal(d.blocked, false);
  });

  it('compare investment documents → FamilyOfficeChief + human approval + blocked in CONSERVE', () => {
    const d = routeTask(w, 'compare investment documents');
    assert.equal(name(d), 'FamilyOfficeChief');
    assert.equal(d.specialist?.name, 'InvestmentOfficeCIOCoordinator');
    assert.equal(d.approvalBoundary, 'human_approval');
    assert.equal(d.dataClass, 'highly_sensitive');
    assert.equal(d.ownerLive, false); // 05 not in CONSERVE core
    assert.equal(d.blocked, true);
    assert.match(d.blockReason ?? '', /not live in CONSERVE/);
  });

  it('find sunset → PersonalOfficeChief + SunsetEngine (no persistent bot unless recurring)', () => {
    const d = routeTask(w, 'find today sunset');
    assert.equal(name(d), 'PersonalOfficeChief');
    assert.ok(d.candidates.some((c) => c.name === 'SunsetEngine'));
    assert.match(d.matchedRule ?? '', /sunset/);
  });

  it('unrouted subject falls to default owner', () => {
    const d = routeTask(w, 'leftovers in the fridge');
    assert.ok(d.owner);
    assert.equal(d.matchedRule, null);
    assert.ok(d.candidates.length > 0);
  });

  it('escalation path always terminates at human', () => {
    for (const subject of [
      'audit PAIOS docs',
      'research weird new capabilities',
      'compare investment documents',
      'run the build',
      'check subscription spend',
    ]) {
      const d = routeTask(w, subject);
      assert.equal(d.escalation.at(-1), 'human', subject);
    }
  });

  it('spend/cost → CostOptimizer', () => {
    const d = routeTask(w, 'review monthly subscription spend');
    assert.equal(name(d), 'CostOptimizer');
    assert.match(d.matchedRule ?? '', /spend|cost/);
  });

  it('assets/portfolio chief is FamilyOfficeChief (spec correction)', () => {
    const d = routeTask(w, 'portfolio review Q3');
    assert.equal(name(d), 'FamilyOfficeChief');
  });
});