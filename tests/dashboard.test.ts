import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadWorkforce } from '../src/registry.js';
import { writeDashboard, dashboardHtml } from '../src/dashboard.js';

const w = loadWorkforce();

describe('dashboard: minimal read-only snapshot', () => {
  it('writes a single self-contained HTML file', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grok-dash-'));
    const r = writeDashboard(w, join(tmp, 'out'));
    assert.ok(existsSync(r.path));
    assert.ok(r.bytes > 10000);
  });

  it('conveys the honest current state, including the 79% constraint', () => {
    const html = dashboardHtml(w);
    assert.match(html, /GrokBot Office — read-only state/);
    assert.match(html, /CONSERVE/);
    assert.match(html, /ChiefOfStaff/);
    assert.match(html, /pnpm grok usage:log/);
    assert.match(html, /Nothing here activates, creates, or messages a GrokBot/);
    assert.match(html, /shared cloud computer is NOT a security boundary/);
    assert.ok((html.match(/<td>/g) ?? []).length >= w.roles.size, 'roster rows for every role');
  });

  it('is deterministic within a day (reproducible artifact)', () => {
    const a = dashboardHtml(w);
    const b = dashboardHtml(w);
    assert.equal(a, b);
  });

  it('never claims a bot is live without materialization status', () => {
    const html = dashboardHtml(w);
    assert.doesNotMatch(html, /live_verified count[^0]/);
  });
});