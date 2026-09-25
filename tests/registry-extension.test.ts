import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadWorkforce } from '../src/registry.js';
import { escalationPath, assertAllChainToHuman } from '../src/hierarchy.js';
import { roleState, canGoLive, usageReport } from '../src/budget.js';
import { readMaterialization, writeMaterializationStatus } from '../src/materialization.js';

const w = loadWorkforce();

const TRAVEL_FAMILY = ['77', '78', '85', '86', '87', '88', '89', '90', '91', '92', '93'];

describe('registry extension: 134 roles, no duplicates, valid hierarchy', () => {
  it('total is exactly 134 with no duplicate ids or names', () => {
    assert.equal(w.roles.size, 134);
    const ids = [...w.roles.keys()];
    assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
    const names = [...w.roles.values()].map((r) => r.name);
    assert.equal(new Set(names).size, names.length, 'duplicate names');
  });

  it('every parent resolves and every role reaches human', () => {
    const { checked, failed } = assertAllChainToHuman(w);
    assert.equal(checked, 134);
    assert.deepEqual(failed, []);
    for (const r of w.roles.values()) {
      const p = w.parent.get(r.id);
      assert.ok(p !== undefined && (w.roles.has(p) || w.anchors.has(p)), `${r.id} dangling parent`);
    }
  });

  it('roles 133 and 134 are present as registry entries only', () => {
    assert.ok(w.roles.has('133'));
    assert.ok(w.roles.has('134'));
    assert.equal(w.roles.get('133')?.name, 'LocationIntelligence');
    assert.equal(w.roles.get('134')?.name, 'GrokBotEcosystemScout');
  });
});

describe('registry extension: 133 LocationIntelligence', () => {
  const r = w.roles.get('133')!;

  it('sits under PersonalOfficeChief with the required fields', () => {
    assert.equal(w.parent.get('133'), '04');
    assert.equal(r.title, 'Personal Location, Travel & Physical-World Concierge');
    assert.equal(r.activation, 'warm');
    assert.equal(r.identityPersistent, true);
    assert.equal(r.runtimePreference, 'supervisor');
    assert.equal(r.budgetClass, 'small');
    assert.equal(r.dataClass, 'confidential');
  });

  it('travel family is reachable via LocationIntelligence parentage', () => {
    for (const id of TRAVEL_FAMILY) {
      assert.ok(w.roles.has(id), `travel role ${id} missing`);
      const { path, ok } = escalationPath(w, id);
      assert.equal(ok, true, `${id} must reach human`);
      assert.ok(path.includes('133'), `${id} escalation path must include 133: ${path.join('→')}`);
    }
  });

  it('travel-family roles remain virtual specialists (no identityPersistent)', () => {
    for (const id of TRAVEL_FAMILY) {
      const role = w.roles.get(id)!;
      assert.notEqual(role.identityPersistent, true, `${id} must not be identityPersistent`);
    }
  });

  it('is NOT live and NOT auto-materialized', () => {
    assert.notEqual(r.activation, 'core');
    assert.notEqual(roleState(w, '133')?.state, 'eligible-live-now');
    assert.equal(canGoLive(w, '133').ok, false);
    assert.equal(readMaterialization()['133'], undefined);
  });
});

describe('registry extension: 134 GrokBotEcosystemScout', () => {
  const r = w.roles.get('134')!;

  it('has IntelligenceChief as parent with the required fields', () => {
    assert.equal(w.parent.get('134'), '02');
    assert.equal(r.title, 'GrokBot & Agent Ecosystem Intelligence Scout');
    assert.equal(r.activation, 'ondemand');
    assert.equal(r.identityPersistent, false);
    assert.equal(r.budgetClass, 'small');
  });

  it('mission bakes in the collection-via-code policy and IntelligenceChief prioritization', () => {
    assert.match(r.mission, /code, GitHub API, web search, cheap models, research workers and AgentOS workers/i);
    assert.match(r.mission, /IntelligenceChief performs final prioritization/i);
  });

  it('dataClass follows sibling precedent (intelligence domain → internal), noted in docs', () => {
    assert.equal(r.dataClass, 'internal');
  });

  it('is NOT live and NOT auto-materialized', () => {
    assert.notEqual(roleState(w, '134')?.state, 'eligible-live-now');
    assert.equal(canGoLive(w, '134').ok, false);
    assert.equal(readMaterialization()['134'], undefined);
  });
});

describe('registry extension: Wave-1 live roles unchanged', () => {
  it('can represent exactly {01,02,03}=live_verified in isolated state', () => {
    const root = mkdtempSync(join(tmpdir(), 'grokbot-office-registry-'));
    for (const id of ['01', '02', '03']) writeMaterializationStatus(root, id, 'live_verified');
    assert.deepEqual(readMaterialization(root), { '01': 'live_verified', '02': 'live_verified', '03': 'live_verified' });
  });

  it('01/02/03 names, tier and parents are unchanged and eval still makes only them eligible-live-now', () => {
    assert.equal(w.roles.get('01')?.name, 'ChiefOfStaff');
    assert.equal(w.roles.get('02')?.name, 'IntelligenceChief');
    assert.equal(w.roles.get('03')?.name, 'ProjectsChief');
    for (const id of ['01', '02', '03']) assert.equal(w.roles.get(id)?.tier, 'command');
    assert.equal(w.parent.get('01'), 'human');
    assert.equal(w.parent.get('02'), '01');
    assert.equal(w.parent.get('03'), '01');

    const report = usageReport(w);
    assert.equal(report.mode, 'CONSERVE');
    assert.deepEqual(report.eligibleLiveNow.map((s) => s.role.id).sort(), ['01', '02', '03']);
    for (const id of ['133', '134']) {
      assert.ok(!report.eligibleLiveNow.some((s) => s.role.id === id), `${id} must not be eligible-live-now`);
    }
  });
});