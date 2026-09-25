import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadWorkforce } from '../src/registry.js';
import { allStates, canGoLive, roleState, usageReport } from '../src/budget.js';

const w = loadWorkforce();

describe('budget: conservation mode (79% used → band CONSERVE)', () => {
  it('only roles 01-03 are eligible-live-now', () => {
    const report = usageReport(w);
    assert.equal(report.mode, 'CONSERVE');
    assert.equal(report.usedPct, 79);
    assert.equal(report.headroom, 21);
    const live = report.eligibleLiveNow.map((s) => s.role.id).sort();
    assert.deepEqual(live, ['01', '02', '03']);
  });

  it('everything else is dormant, next-wave chiefs included', () => {
    for (const id of ['04', '05', '43', '57', '29', '84']) {
      assert.equal(roleState(w, id)?.state, 'dormant', `${id} should be dormant`);
    }
  });

  it('states histogram totals 134', () => {
    const r = usageReport(w);
    const sum = r.eligibleLiveNow.length + r.warmCount + r.onDemandCount + r.dormantCount + r.experimentalCount;
    assert.equal(sum, 134);
    assert.equal(r.dormantCount, 131); // 134 - 3 eligible
  });

  it('canGoLive: only allowlisted roles pass under conservation', () => {
    assert.equal(canGoLive(w, '01').ok, true);
    assert.equal(canGoLive(w, '02').ok, true);
    assert.equal(canGoLive(w, '03').ok, true);
    for (const id of ['04', '05', '43', '57', '11', '118']) {
      assert.equal(canGoLive(w, id).ok, false, `${id} must not go live in conservation`);
    }
  });

  it('budget classes carry token caps', () => {
    const cos = roleState(w, '01')!;
    assert.equal(cos.role.budgetClass, 'medium');
    assert.equal(cos.tokenPerTask, 40000);
    const sc = roleState(w, '33')!; // SerendipityScout tiny
    assert.equal(sc.role.budgetClass, 'tiny');
    assert.equal(sc.tokenPerTask, 5000);
    const dr = roleState(w, '29')!; // DeepResearcher small
    assert.equal(dr.role.budgetClass, 'small');
    assert.equal(dr.tokenPerTask, 15000);
  });

  it('all states are consistent with roles map', () => {
    const states = allStates(w);
    assert.equal(states.length, 134);
    for (const s of states) assert.equal(w.roles.get(s.role.id), s.role);
  });
});