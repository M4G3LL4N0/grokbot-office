import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadWorkforce } from '../src/registry.js';
import {
  assertAllChainToHuman,
  chiefs,
  escalationPath,
  renderTree,
} from '../src/hierarchy.js';

const w = loadWorkforce();

describe('hierarchy: escalation', () => {
  it('every one of the 134 roles reaches human with a valid path', () => {
    const { checked, failed } = assertAllChainToHuman(w);
    assert.equal(checked, 134);
    assert.deepEqual(failed, []);
  });

  it('no role chain contains a cycle', () => {
    for (const id of w.roles.keys()) {
      const { path, ok } = escalationPath(w, id);
      assert.equal(ok, true, `${id} did not reach human`);
      const tail = path.at(-1);
      assert.equal(tail, 'human');
    }
  });

  it('ChiefOfStaff reports directly to human', () => {
    const { path, ok } = escalationPath(w, '01');
    assert.equal(ok, true);
    assert.deepEqual(path, ['01', 'human']);
  });

  it('specialist reaches human via its chief and ChiefOfStaff', () => {
    const { path } = escalationPath(w, '58'); // Controller -> FamilyCFO -> FamilyOfficeChief -> COS -> human
    assert.deepEqual(path, ['58', '57', '05', '01', 'human']);
  });

  it('agentos-owned experiments fold through the AgentOS anchor', () => {
    const { path, ok } = escalationPath(w, '118'); // AgentTournament
    assert.equal(ok, true);
    assert.deepEqual(path, ['118', 'agentos', '01', 'human']);
  });

  it('direct reports to the ChiefOfStaff form the chiefs set (12)', () => {
    const cs = chiefs(w);
    assert.equal(cs.length, 12);
    const names = cs.map((c) => c.name).sort();
    assert.deepEqual(names, [
      'AutomationChief',
      'ChiefOfStaff',
      'CostOptimizer',
      'FamilyOfficeChief',
      'IntelligenceChief',
      'KnowledgeChief',
      'PersonalOfficeChief',
      'PrivateChiefOfStaff',
      'ProjectsChief',
      'RealityAuditor',
      'ResearchChief',
      'SyntheticAdvisoryBoard',
    ]);
    // the ten command-tier chiefs are a strict subset
    const command = cs.filter((c) => c.tier === 'command').map((c) => c.name).sort();
    assert.deepEqual(command, [
      'AutomationChief',
      'ChiefOfStaff',
      'CostOptimizer',
      'FamilyOfficeChief',
      'IntelligenceChief',
      'KnowledgeChief',
      'PersonalOfficeChief',
      'ProjectsChief',
      'RealityAuditor',
      'ResearchChief',
    ]);
  });

  it('tree renders without throwing and contains all sections', () => {
    const lines = renderTree(w);
    assert.ok(lines.length > 60);
  });
});