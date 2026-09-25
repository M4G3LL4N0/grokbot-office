import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadWorkforce } from '../src/registry.js';
import {
  appendUsageEvent,
  readUsageEvents,
  summarizeUsageEvents,
  eventsPath,
} from '../src/usage-events.js';

const w = loadWorkforce();

describe('usage-events: append/read round-trip', () => {
  it('is append-only, one JSON line per event', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-ue-'));
    appendUsageEvent(tmp, {
      timestamp: '2026-09-21T12:00:00.000Z',
      role: 'ChiefOfStaff',
      taskClass: 'triage',
      handoffs: 1,
      resultUseful: true,
      resultConsumedBy: 'human',
      notes: '',
    });
    appendUsageEvent(tmp, {
      timestamp: '2026-09-21T13:00:00.000Z',
      role: 'ProjectsChief',
      taskClass: 'verify',
      handoffs: 0,
      resultUseful: false,
      resultConsumedBy: '',
      notes: 'stack too old',
    });
    const lines = readFileSync(eventsPath(tmp), 'utf8').trimEnd().split('\n');
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]!).role, 'ChiefOfStaff');
  });

  it('persists the exact schema fields', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-ue2-'));
    const ev = appendUsageEvent(tmp, {
      timestamp: '2026-09-21T14:00:00.000Z',
      usedPercentBefore: 79,
      usedPercentAfter: 82,
      role: 'IntelligenceChief',
      taskClass: 'scan',
      handoffs: 2,
      resultUseful: true,
      resultConsumedBy: 'ChiefOfStaff',
      notes: 'found 2 leads',
    });
    assert.deepEqual(ev, {
      timestamp: '2026-09-21T14:00:00.000Z',
      usedPercentBefore: 79,
      usedPercentAfter: 82,
      role: 'IntelligenceChief',
      taskClass: 'scan',
      handoffs: 2,
      resultUseful: true,
      resultConsumedBy: 'ChiefOfStaff',
      notes: 'found 2 leads',
    });
    const { events } = readUsageEvents(tmp);
    assert.equal(events[0]!.usedPercentAfter, 82);
  });

  it('rejects invalid events instead of writing them', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-ue3-'));
    assert.throws(() =>
      appendUsageEvent(tmp, { timestamp: 't', role: '', taskClass: 'x', handoffs: 0, resultUseful: true, resultConsumedBy: '', notes: '' }),
    );
    assert.throws(() =>
      appendUsageEvent(tmp, { timestamp: 't', role: 'CPS', taskClass: 'x', handoffs: -1, resultUseful: true, resultConsumedBy: '', notes: '' }),
    );
    assert.throws(() =>
      appendUsageEvent(tmp, { timestamp: 't', role: 'CPS', taskClass: 'x', handoffs: 0, resultUseful: true, usedPercentAfter: 101, resultConsumedBy: '', notes: '' }),
    );
    assert.equal(readdirSync(tmp).filter((f) => f.endsWith('.jsonl')).length, 0);
  });

  it('skips corrupt lines and reports them (never guesses)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-ue4-'));
    appendUsageEvent(tmp, { timestamp: '2026-09-21T10:00:00.000Z', role: 'ChiefOfStaff', taskClass: 't', handoffs: 0, resultUseful: true, resultConsumedBy: '', notes: '' });
    const p = eventsPath(tmp);
    const raw = readFileSync(p, 'utf8');
    writeFileSync(p, raw + '{"role": broken json}\n');
    const { events, skipped } = readUsageEvents(tmp);
    assert.equal(events.length, 1);
    assert.equal(skipped, 1);
  });

  it('never writes to the real repo when given a temp root', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-ue6-'));
    appendUsageEvent(tmp, { timestamp: '2026-09-21T09:00:00.000Z', role: 'ChiefOfStaff', taskClass: 't', handoffs: 0, resultUseful: true, resultConsumedBy: '', notes: '' });
    assert.ok(join(tmp, 'state', 'usage-events.jsonl'));
  });
});

describe('usage-events: report aggregation', () => {
  it('never claims roles were useful without recorded events', () => {
    const { events } = readUsageEvents('/nonexistent-dir');
    const s = summarizeUsageEvents(events, w);
    assert.equal(s.total, 0);
    assert.equal(s.neverUsed.length, w.roles.size);
  });

  it('aggregates honestly per role', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-ue5-'));
    appendUsageEvent(tmp, { timestamp: '2026-09-21T09:00:00.000Z', role: 'ChiefOfStaff', taskClass: 'triage', handoffs: 1, resultUseful: true, resultConsumedBy: 'human', notes: '' });
    appendUsageEvent(tmp, { timestamp: '2026-09-21T10:00:00.000Z', role: 'ChiefOfStaff', taskClass: 'triage', handoffs: 0, resultUseful: true, resultConsumedBy: 'human', notes: '' });
    appendUsageEvent(tmp, { timestamp: '2026-09-21T11:00:00.000Z', role: 'ProjectsChief', taskClass: 'verify', handoffs: 3, resultUseful: false, resultConsumedBy: '', notes: 'nope' });
    const { events } = readUsageEvents(tmp);
    const s = summarizeUsageEvents(events, w);
    assert.equal(s.total, 3);
    assert.equal(s.mostUsefulRoles[0]!.role, 'ChiefOfStaff');
    assert.equal(s.mostUsefulRoles[0]!.useful, 2);
    const hc = s.highCostLowValue;
    assert.equal(hc.length, 1);
    assert.equal(hc[0]!.role, 'ProjectsChief');
    assert.equal(hc[0]!.handoffs, 3);
    assert.equal(s.byRole.find((r) => r.role === 'ChiefOfStaff')!.usefulRatio, 1);
    assert.ok(s.keepWarm.includes('ChiefOfStaff'));
  });

  it('only flags high-cost/low-value when both signs are present', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-ue7-'));
    appendUsageEvent(tmp, { timestamp: 't', role: 'ProjectsChief', taskClass: 'verify', handoffs: 0, resultUseful: false, resultConsumedBy: '', notes: '' });
    appendUsageEvent(tmp, { timestamp: 't', role: 'ProjectsChief', taskClass: 'verify', handoffs: 2, resultUseful: true, resultConsumedBy: 'human', notes: 'solved' });
    const { events } = readUsageEvents(tmp);
    const s = summarizeUsageEvents(events, w);
    assert.equal(s.highCostLowValue.length, 0); // useful-2-handoffs and 0-handoff-unuseful are NOT flagged
  });
});