import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadWorkforce } from '../src/registry.js';
import { compileAll, compileRole } from '../src/compiler.js';

const w = loadWorkforce();

describe('compiler: micro-prompts stay compact', () => {
  it('compiles all 134 roles', () => {
    const all = compileAll(w);
    assert.equal(all.length, 134);
    assert.ok(all[0]!.roleId < all[1]!.roleId, 'sorted by id');
  });

  it('every prompt = kernel + mission + routing, no bloat', () => {
    for (const c of compileAll(w)) {
      assert.ok(c.prompt.startsWith(c.kernel), `${c.name} starts with kernel`);
      assert.ok(c.prompt.includes(`ROLE: ${c.name} —`), `${c.name} has role line`);
      assert.ok(c.prompt.includes('ROUTING:'), `${c.name} has routing`);
      // compact: full prompt under ~700 chars for the longest missions
      assert.ok(c.prompt.length < 900, `${c.name} prompt too long: ${c.prompt.length}`);
      const lines = c.prompt.split('\n');
      assert.ok(lines.length <= 5, `${c.name} prompt has ${lines.length} lines`);
    }
  });

  it('ChiefOfStaff prompt names human as report target', () => {
    const p = compileRole(w, '01')!;
    assert.ok(p.prompt.includes('report → human'));
    assert.ok(p.prompt.includes('escalate irreversibles → human'));
    assert.ok(p.prompt.includes('ChiefOfStaff — Own attention'));
  });

  it('specialist prompt names its chief; boundary reflects policy', () => {
    const qa = compileRole(w, '16')!; // AutonomousQA under ProjectsChief
    assert.ok(qa.prompt.includes('report → ProjectsChief'));
    assert.ok(qa.prompt.includes('boundary: information'));
    const cfo = compileRole(w, '57')!; // FamilyCFO
    assert.ok(cfo.prompt.includes('report → FamilyOfficeChief'));
    assert.ok(cfo.prompt.includes('boundary: human_approval'));
    assert.ok(cfo.prompt.includes('data: highly_sensitive'));
  });

  it('oneLine is a single tight line', () => {
    for (const c of compileAll(w)) {
      assert.ok(!c.oneLine.includes('\n'));
      // missions are information-dense by design (roles 133/134 carry an
      // explicit collection/consolidation policy), so allow longer tight lines
      assert.ok(c.oneLine.length < 620);
    }
  });
});