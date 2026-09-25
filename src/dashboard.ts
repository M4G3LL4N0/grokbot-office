// GrokBot Office — minimal READ-ONLY dashboard (optional deliverable §10).
// A single self-contained HTML file written to generated/dashboard.html.
// It displays workforce state, the usage governor, materialization status and
// the honest usage-events log. It has NO write path, NO network calls and NO
// script outside one tiny in-page filter. If evidence says otherwise it must be
// regenerated; it never claims a bot is live.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './paths.js';
import type { Workforce } from './registry.js';
import { allStates, usageReport } from './budget.js';
import { readMaterialization } from './materialization.js';
import { readUsageEvents, summarizeUsageEvents } from './usage-events.js';
import { renderTree } from './hierarchy.js';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function dashboardHtml(w: Workforce): string {
  const report = usageReport(w);
  const states = allStates(w);
  const mat = readMaterialization();
  const { events, skipped } = readUsageEvents(ROOT);
  const summary = summarizeUsageEvents(events, w, skipped);

  const matCounts: Record<string, number> = {};
  for (const v of Object.values(mat)) matCounts[v] = (matCounts[v] ?? 0) + 1;

  const rosterRows = states
    .map((s) => {
      const parent = w.parent.get(s.role.id) ?? '';
      const m = mat[s.role.id] ?? 'registry_only';
      return `<tr><td>${s.role.id}</td><td>${esc(s.role.name)}</td><td>${esc(s.role.title)}</td>` +
        `<td>${s.state}</td><td>${m}</td><td>${esc(parent)}</td><td>${s.role.budgetClass}</td>` +
        `<td>${s.role.dataClass}</td><td>${s.role.approvalBoundary}</td></tr>`;
    })
    .join('\n');

  const groupRows = w.groupTemplates
    .map((t) => {
      const names = t.memberIds.map((id) => w.roles.get(id)?.name ?? id).join(', ');
      return `<li><strong>${esc(t.name)}</strong> — owner ${esc(w.roles.get(t.taskOwnerId)?.name ?? t.taskOwnerId)} (${t.memberIds.length} bots): ${esc(names)}. ${esc(t.purpose)}</li>`;
    })
    .join('\n');

  const routineRows = w.routineTemplates
    .map((t) => {
      const names = t.memberIds.map((id) => w.roles.get(id)?.name ?? id).join(' + ');
      return `<li><strong>${esc(t.name)}</strong> cadence=${esc(t.cadence)} enabled=${t.enabled} graduated=${t.graduated}: ${esc(names)} — ${esc(t.purpose)} (consumer: ${esc(t.consumer)})</li>`;
    })
    .join('\n');

  const eventRows = events
    .slice(-15)
    .map((e) => {
      const tk = `${e.role} – ${esc(e.taskClass)}, ${e.handoffs} handoffs, useful=${e.resultUseful ? 'yes' : 'no'}, consumedBy=${esc(e.resultConsumedBy || '—')}, used ${e.usedPercentBefore ?? '?'}%→${e.usedPercentAfter ?? '?'}%`;
      return `<li>${e.timestamp} · ${esc(tk)}${e.notes ? ` · ${esc(e.notes)}` : ''}</li>`;
    })
    .join('\n');

  const tree = renderTree(w).map((l) => esc(l)).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GrokBot Office — read-only state</title>
<style>
body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin:2rem auto;max-width:1100px;padding:0 1rem;color:#1a1a1a;background:#fafafa}
h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:2rem;border-top:1px solid #ddd;padding-top:1rem}
.banner{border:1px solid #b45309;background:#fef3c7;padding:.75rem 1rem;border-radius:6px}
table{border-collapse:collapse;width:100%;font-size:.78rem}th,td{border:1px solid #ddd;padding:.25rem .5rem;text-align:left}
th{background:#eee;position:sticky;top:0}input{padding:.4rem;width:18rem;margin-bottom:.5rem}
.muted{color:#666;font-size:.8rem}.warn{color:#b45309}
pre{background:#fff;border:1px solid #ddd;padding:.75rem;overflow:auto;font-size:.75rem}
</style></head><body>
<h1>GrokBot Office — read-only state</h1>
<p class="muted">Regenerated: ${new Date().toISOString().slice(0, 10)} · source: local registry + state files. Nothing here activates, creates, or messages a GrokBot.</p>

<div class="banner"><strong>${report.mode}</strong> — ${report.usedPct}% used / ${report.remainingPct}% remaining
(headroom ${report.headroom}%). Eligible live now: ${report.eligibleLiveNow.map((s) => `${s.role.id} ${esc(s.role.name)}`).join(', ')}.
Recommended roster: create only <strong>ChiefOfStaff, IntelligenceChief, ProjectsChief</strong>; all other ${report.dormantCount} roles stay dormant.</div>

<h2>State</h2>
<ul class="muted">
<li>Roles ${report.totalRoles} · anchors ${w.anchors.size} · groups ${w.groupTemplates.length} · routines ${w.routineTemplates.length}</li>
<li>States: eligible_live_now=${report.eligibleLiveNow.length} dormant=${report.dormantCount} on-demand=${report.onDemandCount} experimental=${report.experimentalCount} warm=${report.warmCount}</li>
<li>Materialization (human-reported): ${Object.entries(matCounts).map(([k, v]) => `${k}=${v}`).join(', ') || 'none yet'}</li>
<li>Usage events logged: ${summary.total}${skipped ? ` (${skipped} skipped corrupt lines)` : ''}${events.length ? ` · last: ${events[events.length - 1]!.timestamp}` : ''}</li>
<li>Reset date: ${report.resetDate ?? 'unknown (set via: pnpm grok usage:reset YYYY-MM-DD)'}${report.resetDate ? ` · days until reset: ${Math.ceil((new Date(report.resetDate).getTime() - Date.now()) / 86400000)}` : ''}</li>
</ul>

<h2>Guardrails (CONFIGURED)</h2>
<ul class="muted">
<li>No autonomous bot creation · no routine enabled · no money/purchase/investment/legal/medical autonomy · irreversible actions → human approval</li>
<li>Secrets never in prompts/config/git; webhook keys are env-only; shared cloud computer is NOT a security boundary</li>
<li>Telemetry is human-recorded (state/usage-events.jsonl); Cursor's meter is not scraped, token numbers are never fabricated</li>
</ul>

<h2>Roster <span class="muted">(${states.length})</span></h2>
<input id="q" type="search" placeholder="filter by name/title/id…" aria-label="filter roster">
<table id="roster"><thead><tr><th>id</th><th>name</th><th>title</th><th>state</th><th>materialized</th><th>chief</th><th>budget</th><th>data</th><th>approval</th></tr></thead>
<tbody>${rosterRows}</tbody></table>

<h2>Recommended live roster (see docs/INSTALL_AND_ROLLOUT.md)</h2>
<p class="muted">Wave 1 (now, 79% used): ChiefOfStaff, ProjectsChief, IntelligenceChief — with the exact smoke tasks from INSTALL_AND_ROLLOUT.md. Waves 2-6 only after the weekly reset per the rollout plan.</p>

<h2>Groups (templates, never live) — max 6 bots</h2>
<ul>${groupRows || '<li class="muted">none</li>'}</ul>

<h2>Routines (all disabled — graduation required)</h2>
<ul>${routineRows || '<li class="muted">none</li>'}</ul>

<h2>Usage events (last 15 of ${summary.total})</h2>
<ul>${eventRows || '<li class="muted">no events recorded yet — log them with: pnpm grok usage:log &lt;role&gt; [--useful|--not-useful] [--handoffs N]'}</li></ul>

<h2>Hierarchy</h2>
<pre>${tree}</pre>

<script>
const q=document.getElementById('q'),tb=document.getElementById('roster');
q.addEventListener('input',()=>{const s=q.value.toLowerCase();
for(const tr of tb.tBodies[0].rows)tr.style.display=tr.textContent.toLowerCase().includes(s)?'':'none';});
</script>
</body></html>
`;
}

/** Write generated/dashboard.html. Returns the path it wrote. */
export function writeDashboard(w: Workforce, outDir = join(ROOT, 'generated')): { path: string; bytes: number } {
  mkdirSync(outDir, { recursive: true });
  const p = join(outDir, 'dashboard.html');
  const html = dashboardHtml(w);
  writeFileSync(p, html);
  return { path: p, bytes: Buffer.byteLength(html) };
}