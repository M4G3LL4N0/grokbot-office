import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadWorkforce } from '../src/registry.js';
import { firstSmokeTask } from '../src/registry.js';
import { buildAllProfiles, buildProfile, renderProfile, approxTokens, topRoster } from '../src/profiles.js';
import { compileRole } from '../src/compiler.js';
import { chiefs } from '../src/hierarchy.js';

const w = loadWorkforce();

describe('profiles: every role has a valid compact card', () => {
  const all = buildAllProfiles(w);

  it('one card per role (134)', () => {
    assert.equal(all.length, w.roles.size);
    assert.equal(all.length, 134);
  });

  it('all cards are compact (<=900 chars, <=5 lines) with ~tokens=chars/4', () => {
    for (const p of all) {
      assert.ok(p.chars > 0, p.name);
      assert.ok(p.chars <= 900, `${p.name}: ${p.chars}c`);
      assert.ok(p.lines <= 5, `${p.name}: ${p.lines} lines`);
      assert.equal(p.tokens, approxTokens(p.description));
      assert.equal(p.tokens, Math.ceil(p.chars / 4));
    }
  });

  it('cards embed kernel + ROLE + ROUTING lines', () => {
    for (const p of all) {
      assert.ok(p.description.startsWith(w.kernel), p.name);
      assert.match(p.description, new RegExp(`ROLE: ${p.name} —`), p.name);
      assert.match(p.description, /ROUTING: /, p.name);
    }
  });

  it('every card has a smoke task and resolves parent', () => {
    for (const p of all) {
      const role = w.roles.get(p.id)!;
      assert.ok(p.firstSmokeTask.length > 0, p.name);
      assert.equal(p.firstSmokeTask, firstSmokeTask(w, role));
      assert.ok(p.parent.length > 0, p.name);
    }
  });

  it('optionalGroups <= 6 and all members exist', () => {
    for (const p of all) {
      assert.ok(p.optionalGroups.length <= 6, p.name);
    }
  });

  it('renderProfile is a paste-ready card', () => {
    const p = all[0]!;
    const md = renderProfile(p);
    for (const tag of ['NAME ', 'TITLE ', 'DESCRIPTION', 'PARENT ', 'ACTIVATION ', 'FIRST_SMOKE_TASK ', 'OPTIONAL_GROUPS']) {
      assert.ok(md.includes(tag), tag);
    }
    assert.match(md, /# compactness/);
  });

  it('no twin descriptions (deterministic, no boilerplate drift)', () => {
    const seen = new Map<string, string>();
    for (const p of all) {
      const k = p.description.replace(/ROLE: [A-Za-z]+/, 'ROLE: X');
      assert.ok(!seen.has(k), `twin: ${seen.get(k)} & ${p.name}`);
      seen.set(k, p.name);
    }
  });

  it('build-all is deterministic (round-trip stable)', () => {
    const a = buildAllProfiles(w);
    const b = buildAllProfiles(w);
    assert.deepEqual(a, b);
  });

  it('cloned output has identical content', () => {
    const a = JSON.parse(JSON.stringify(buildAllProfiles(w)));
    const b = buildAllProfiles(w);
    assert.deepEqual(a, JSON.parse(JSON.stringify(b)));
  });
});

describe('profiles: top roster', () => {
  it('includes the full 12-count chiefs set plus eligible live', () => {
    const top = topRoster(w).map((r) => r.name);
    const cs = chiefs(w).map((r) => r.name);
    for (const c of cs) assert.ok(top.includes(c), `missing ${c}`);
    for (const name of ['ChiefOfStaff', 'IntelligenceChief', 'ProjectsChief']) assert.ok(top.includes(name));
    assert.ok(cs.length >= 12, `chiefs: ${cs.length}`);
  });
});

describe('profiles: compile metrics', () => {
  it('compileRole exposes chars/tokens', () => {
    const c = compileRole(w, '01')!;
    assert.equal(c.chars, c.prompt.length);
    assert.equal(c.tokens, Math.ceil(c.chars / 4));
  });

  it('buildProfile matches compileRole output', () => {
    const c = compileRole(w, '01')!;
    const p = buildProfile(w, '01')!;
    assert.equal(p.description, c.prompt);
    assert.equal(p.chars, c.chars);
    assert.equal(p.tokens, c.tokens);
  });
});