import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { modeFor, USAGE_BANDS, readUsageState, setUsageUsedPct, setHarvestEnabled, setResetDate, harvestAvailable, daysUntilReset, setOnDemandEnabled } from '../src/usage.js';
import { usageReport } from '../src/budget.js';
import { loadWorkforce } from '../src/registry.js';

const w = loadWorkforce();
const tmp = mkdtempSync(join(tmpdir(), 'grok-usage-'));

describe('usage: bands', () => {
  it('bands cover 0-100 without gaps and are sorted desc', () => {
    for (let i = 0; i < 100; i++) {
      const b = modeFor(i);
      assert.ok(b, `modeFor(${i})`);
    }
    assert.equal(modeFor(0).label, 'EXPLORE');
    assert.equal(modeFor(24).label, 'EXPLORE');
    assert.equal(modeFor(25).label, 'NORMAL');
    assert.equal(modeFor(49).label, 'NORMAL');
    assert.equal(modeFor(50).label, 'CONSERVE_LIGHT');
    assert.equal(modeFor(74).label, 'CONSERVE_LIGHT');
    assert.equal(modeFor(75).label, 'CONSERVE');
    assert.equal(modeFor(89).label, 'CONSERVE');
    assert.equal(modeFor(90).label, 'CRITICAL');
    assert.equal(modeFor(100).label, 'CRITICAL');
    assert.equal(USAGE_BANDS.length, 5);
  });

  it('79% used lands in CONSERVE with core 01-03', () => {
    const st = readUsageState(tmp, 79);
    const b = modeFor(st.usedPercent);
    assert.equal(b.label, 'CONSERVE');
    assert.deepEqual(b.liveCore, ['01', '02', '03']);
    assert.equal(b.groupsAllowed, 'never');
    assert.equal(b.routines, 'off');
    assert.equal(b.experimentalBlocked, true);
    assert.equal(b.proactiveResearch, false);
  });
});

describe('usage: state persistence', () => {
  it('defaults when no file exists', () => {
    const st = readUsageState(tmp, 79);
    assert.equal(st.usedPercent, 79);
    assert.equal(st.remainingPercent, 21);
    assert.equal(st.onDemandEnabled, false);
    assert.equal(st.resetDate, null);
    assert.equal(st.lastUpdated, '-');
  });

  it('setUsageUsedPct clamps and recomputes remaining', () => {
    const st = setUsageUsedPct(tmp, 150);
    assert.equal(st.usedPercent, 100);
    assert.equal(st.remainingPercent, 0);
    const st2 = setUsageUsedPct(tmp, -5);
    assert.equal(st2.usedPercent, 0);
    const st3 = setUsageUsedPct(tmp, 79);
    assert.equal(st3.remainingPercent, 21);
  });

  it('harvest availability rules', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'grok-harvest-'));
    assert.equal(harvestAvailable(readUsageState(fresh, 79)).available, false);
    setHarvestEnabled(fresh, true);
    const noReset = readUsageState(fresh, 79);
    assert.equal(harvestAvailable(noReset).available, false);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    setResetDate(fresh, tomorrow);
    const near = harvestAvailable(readUsageState(fresh, 79));
    assert.equal(near.available, true);
    assert.match(near.why, /harvest window/);
    setHarvestEnabled(fresh, false);
    assert.equal(harvestAvailable(readUsageState(fresh, 79)).available, false);
  });

  it('harvest unavailable when remaining too low', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'grok-harvest2-'));
    setHarvestEnabled(fresh, true);
    setResetDate(fresh, new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10));
    setUsageUsedPct(fresh, 98);
    const r = harvestAvailable(readUsageState(fresh, 98));
    assert.equal(r.available, false);
    assert.match(r.why, /no meaningful unused allowance/);
  });

  it('daysUntilReset computes relative days', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'grok-reset-'));
    setResetDate(fresh, new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10));
    const d = daysUntilReset(readUsageState(fresh));
    assert.ok(d !== null && d <= 4, `expected ~3d, got ${d}`);
    const fresh2 = mkdtempSync(join(tmpdir(), 'grok-reset2-'));
    assert.equal(daysUntilReset(readUsageState(fresh2)), null);
  });

  it('on-demand switch is human-only and disabled by default', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'grok-od-'));
    assert.equal(readUsageState(fresh).onDemandEnabled, false);
    setOnDemandEnabled(fresh, true);
    assert.equal(readUsageState(fresh).onDemandEnabled, true);
  });
});

describe('usage: governor integrates with workforce', () => {
  it('usageReport reflects the persisted band (79 → CONSERVE)', () => {
    const r = usageReport(w);
    assert.equal(r.usedPct, 79);
    assert.equal(r.mode, 'CONSERVE');
    assert.equal(r.headroom, 21);
    assert.deepEqual(r.eligibleLiveNow.map((s) => s.role.id).sort(), ['01', '02', '03']);
  });
});