#!/usr/bin/env node
// GrokBot Office CLI. Read-only by default; only `export` writes generated/
// artifacts and state commands persist to state/. Never activates, messages,
// schedules, or bulk-creates GrokBots.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './paths.js';
import { loadWorkforce, firstSmokeTask } from './registry.js';
import { compileAll, compileRole } from './compiler.js';
import { assertAllChainToHuman, escalationPath, renderTree, formatPath } from './hierarchy.js';
import { legalHandoff, routeFor, routeTask } from './routing.js';
import { usageReport, roleState, canGoLive } from './budget.js';
import { parsePacket, serializePacket, isChatter } from './packets.js';
import { writeGenerated } from './export.js';
import { buildProfile, buildAllProfiles, renderProfile, writeProfiles } from './profiles.js';
import {
  readUsageState,
  setUsageUsedPct,
  setResetDate,
  setOnDemandEnabled,
  setHarvestEnabled,
  modeFor,
  daysUntilReset,
} from './usage.js';
import { allowedNow, rolloutReport } from './rollout.js';
import { readMaterialization, writeMaterializationStatus, materializePlan, shouldCreateDecision, MATERIALIZATION_STATUSES } from './materialization.js';
import { appendUsageEvent, readUsageEvents, summarizeUsageEvents } from './usage-events.js';
import { writeDashboard } from './dashboard.js';
import { statusFor } from './adapters/grokbot-routine-webhook.js';
import { agentosAdapter, orgosAdapter, paiosAdapter, revenueosAdapter, paiosDescriptor } from './adapters/integrations.js';
import {
  bridgeCheck,
  formatBridgeReport,
  bridgeBundle,
} from './bridge.js';
import {
  writeBootstrap,
  verifyChecksums,
  createCardFor,
  liveRosterMd,
} from './bootstrap.js';
import {
  readBootstrapState,
  setBootstrapStatus,
  advanceToPackageReady,
  BOOTSTRAP_STATUSES,
  isBootstrapStatus,
} from './bootstrap-state.js';
import { a2aSmokeTest, A2A_SMOKE_SPEC } from './a2a-smoke.js';

const writePaiosDescriptor = (wf: typeof w): string => {
  const path = paiosDescriptor(wf);
  const block = [
    '# GrokBot Office → PAIOS descriptor (PROPOSAL — read-only, not wired)',
    '',
    'This file documents the CONTRACT boundary between the GrokBot Office workforce',
    'definitions and PAIOS (paios-sdk / paios-publishing-sdk). It proposes nothing and',
    'wires nothing. A real integration requires an independently verified interface and',
    'the GROK_FEATURE_INTEGRATIONS flag (off by default).',
    '',
    '## What GrokBot Office can offer PAIOS (proposal)',
    '- role profiles for publishing/economic-intelligence agents with SENSITIVE/PRIVATE rules',
    '- reading PAIOS SDK TypeScript contracts, never writing',
    '',
    '## Ground truth',
    `- roles in registry: ${wf.roles.size} (source: registry/roles.yaml)`,
    `- feature flag: GROK_FEATURE_INTEGRATIONS=${process.env.GROK_FEATURE_INTEGRATIONS ?? '(unset)'}`,
  ].join('\n') + '\n';
  writeFileSync(path, block);
  return path;
};

const writeRevenueDiscovery = (wf: typeof w): string => {
  const path = join(ROOT, 'generated', 'revenueos-role-discovery.json');
  const roles = [...wf.roles.values()]
    .filter((r) => r.tags.includes('revenue-intelligence'))
    .map((r) => ({ id: r.id, name: r.name, tier: r.tier, dataClass: r.dataClass, activation: r.activation }));
  const payload = {
    source: 'registry/roles.yaml revenue_intelligence roles',
    note: 'read-only discovery inventory; never triggers deals; consumers unverified.',
    roles,
  };
  writeFileSync(path, JSON.stringify(payload, null, 2) + '\n');
  return path;
};

const w = loadWorkforce();

const usage = `grokbot-office <command>

read-only:
  validate                integrity + every role reaches human (exit 0/1)
  roles [--all]           table of roles + effective live state
  role <id|name>          details + compiled prompt + setup profile
  tree                    hierarchy tree under human
  path <id> [id]          escalation path to human (or to target)
  route <subject>         full routing decision (owner, specialist, mode, blockers)
  handoff <from> <to> [subject]   legal A2A handoff check
  live                    roles eligible to be live now
  budget                  usage report + token caps
  mode                    usage band + what it allows/blocks
  allowed                 who may run now + why others are blocked
  rollout                 phased implementation plan (never activates anything)
  packet <line>           parse/validate a canonical packet
  compile                 all compiled micro-prompts
  profile <id|name>       print a single profile card
  list [--tier <t>] [--domain <d>]   compact roster
  groups                  group templates (max 6 bots each)
  routines                routine templates (all disabled; graduation rules)
  doctor                  full integrity sweep (exit 1 on failure)
  webhook status <role>   webhook routine state (never prints keys)
  usage:report            honest telemetry summary (usage-events.jsonl only)
  should-create <role>    decision aid: dedicated Bot vs temporary chief-run role
  a2a-smoke               minimum-cost A2A hierarchy smoke (ChiefOfStaff↔projects↔intelligence)
  roster                  live roster from human-confirmed materialization state
  dashboard               write generated/dashboard.html (read-only snapshot)
  materialize:plan <id|name>   exact manual creation instructions
state-changing (allowlisted, local only):
  usage:set <pct>         record used usage % (0-100) → recompute mode
  usage:reset <YYYY-MM-DD> record next reset date
  usage:ondemand <on|off> human-only on-demand billing switch
  usage:harvest <on|off>  human-only end-of-cycle harvest switch
  usage:log <role> [taskClass]  append one telemetry event (--useful|--not-useful --handoffs N --before N --after N --consumedBy X --notes "...")
  materialize:set <id> <status>   mark real-world bot status
  export [--dry]          write generated/ artifacts
`;

const findRole = (q: string, { loose = false } = {}): string => {
  const exact = w.roles.get(q);
  if (exact) return q;
  const byName = [...w.roles.values()].find((r) => r.name === q || r.name.toLowerCase() === q.toLowerCase());
  if (byName) return byName.id;
  if (loose) {
    const like = [...w.roles.values()].find((r) => r.name.toLowerCase().includes(q.toLowerCase()));
    if (like) return like.id;
  }
  throw new Error(`unknown role: ${q}`);
};

const cmd = process.argv[2] ?? 'validate';
const arg = (i: number): string | undefined => process.argv[3 + i];

const flagValue = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (name: string): boolean => process.argv.includes(name);

function out(s: string): void {
  process.stdout.write(s + '\n');
}

function stateLine(s: { role: { id: string; name: string; title: string }; state: string }): string {
  return `${s.role.id}\t${s.role.name}\t${s.role.title}\t${s.state}`;
}

try {
  switch (cmd) {
    case 'validate': {
      const { checked, failed } = assertAllChainToHuman(w);
      for (const r of w.roles.values()) {
        if (w.parent.get(r.id) === undefined) failed.push(r.id);
      }
      const dupeNames = [
        ...new Set([...w.roles.values()].map((r) => r.name).filter((n, i, a) => a.indexOf(n) !== i)),
      ];
      out(`integrity: ${checked} roles, ${w.anchors.size} anchors`);
      out(`escalation-path failures: ${failed.length > 0 ? failed.join(', ') : 'none'}`);
      out(`duplicate names: ${dupeNames.length > 0 ? dupeNames.join(', ') : 'none'}`);
      process.exit(0);
      break;
    }
    case 'roles': {
      out('id\tname\ttitle\tstate\tchief\tbudget\tapproval\tdata');
      for (const s of [...w.roles.keys()].map((id) => roleState(w, id)!).sort((a, b) => a.role.id.localeCompare(b.role.id, undefined, { numeric: true }))) {
        const parent = w.parent.get(s.role.id) ?? '';
        out(
          `${s.role.id}\t${s.role.name}\t${s.role.title}\t${s.state}\t${parent}\t${s.role.budgetClass}\t${s.role.approvalBoundary}\t${s.role.dataClass}`,
        );
      }
      const states = usageReport(w);
      out(
        `\nstates: eligible-live-now=${states.eligibleLiveNow.length} warm=${states.warmCount} on-demand=${states.onDemandCount} dormant=${states.dormantCount} experimental=${states.experimentalCount} of ${states.totalRoles}`,
      );
      break;
    }
    case 'list': {
      const tier = process.argv.indexOf('--tier');
      const domain = process.argv.indexOf('--domain');
      const tierVal = tier >= 0 ? arg(tier) : undefined;
      const domainVal = domain >= 0 ? arg(domain) : undefined;
      out('id\tname\tstate\tbudget\tdata\tactivation');
      for (const s of [...w.roles.keys()].map((id) => roleState(w, id)!).sort((a, b) => a.role.id.localeCompare(b.role.id, undefined, { numeric: true }))) {
        const r = s.role;
        if (tierVal && r.tier !== tierVal) continue;
        if (domainVal && r.domain !== domainVal) continue;
        out(`${r.id}\t${r.name}\t${s.state}\t${r.budgetClass}\t${r.dataClass}\t${r.activation}`);
      }
      break;
    }
    case 'role': {
      const query = process.argv[3];
      if (!query) throw new Error('usage: role <id|name>');
      const id = findRole(query, { loose: true });
      const compiled = compileRole(w, id)!;
      const s = roleState(w, id)!;
      const { path, ok, error } = escalationPath(w, id);
      out(`id: ${s.role.id}  name: ${s.role.name}  title: ${s.role.title}`);
      out(`tier: ${s.role.tier}  priority: ${s.role.priority}  activation: ${s.role.activation}`);
      out(`state: ${s.state}  canCreate: ${s.canCreate}  canGoLive: ${canGoLive(w, id).ok ? 'yes' : canGoLive(w, id).why}`);
      out(`parent: ${w.parent.get(id) ?? '-'}  escalation: ${formatPath(w, path)} (${ok ? 'OK' : error})`);
      out(
        `budget: ${s.role.budgetClass} (${s.tokenPerTask} tok/task)  handoffs: ${s.role.maxHandoffs}  approval: ${s.role.approvalBoundary}  data: ${s.role.dataClass}`,
      );
      out(`peers: ${s.role.allowedPeers.join(', ')}`);
      out(`groups: ${s.role.groupCandidates.join(', ')}  routines: ${s.role.routineCandidates.join(', ')}`);
      out(`tags: ${s.role.tags.join(', ')}`);
      out(`smoke task: ${firstSmokeTask(w, s.role) || '(none)'}`);
      out('--- compiled prompt ---');
      out(compiled.prompt);
      break;
    }
    case 'tree':
      out(renderTree(w).join('\n'));
      break;
    case 'path': {
      const from = process.argv[3];
      const to = process.argv[4];
      if (!from) throw new Error('usage: path <id> [id]');
      const fid = findRole(from);
      const { path, ok, error } = escalationPath(w, fid);
      out(`${formatPath(w, path)} (${ok ? 'OK' : error})`);
      if (to) {
        const tid = findRole(to);
        const { path: p2 } = escalationPath(w, tid);
        out(`target ${w.roles.get(tid)?.name} chain: ${formatPath(w, p2)}`);
      }
      break;
    }
    case 'route': {
      const subject = process.argv.slice(3).join(' ');
      if (!subject) throw new Error('usage: route <subject>');
      const d = routeTask(w, subject);
      out(`subject: ${d.subject}`);
      out(`match: ${d.matchedRule ?? 'unrouted'}`);
      out(`owner: ${d.owner.name} (${d.owner.id})  [${d.ownerLive ? `live in ${d.band.label}` : `NOT live in ${d.band.label}`}]`);
      if (d.specialist) out(`specialist: ${d.specialist.name} (${d.specialist.id})`);
      out(`mode: ${d.band.label}  [max specialists/request: ${d.maxSpecialistsPerRequest}]`);
      out(`budget: ${d.budgetClass} (${d.tokensPerTask} tok/task)  approval: ${d.approvalBoundary}  data: ${d.dataClass}`);
      out(`group justified: ${d.groupJustified ? 'yes' : 'no'}  proactive scanning: ${d.proactiveDisabled ? 'DISABLED' : 'enabled'}`);
      out(`blocked: ${d.blocked ? `YES — ${d.blockReason}` : 'no'}`);
      out(`escalation: ${formatPath(w, d.escalation)}`);
      break;
    }
    case 'handoff': {
      const from = findRole(process.argv[3] ?? '');
      const to = findRole(process.argv[4] ?? '');
      if (!from || !to) throw new Error('usage: handoff <from> <to> [subject]');
      const subject = process.argv.slice(5).join(' ');
      const d = legalHandoff(w, from, to, subject);
      out(`handoff ${w.roles.get(from)!.name} → ${w.roles.get(to)!.name}: ${d.allowed ? 'ALLOWED' : 'DENIED'}`);
      out(`reason: ${d.reason}`);
      out(`path: ${d.path.join(' → ')}`);
      break;
    }
    case 'live': {
      const report = usageReport(w);
      out(`mode: ${report.mode} (${report.usedPct}% used / ${report.remainingPct}% remaining / ${report.headroom}% headroom)`);
      out(`eligible-live-now (${report.eligibleLiveNow.length}):`);
      for (const s of report.eligibleLiveNow) out(`  ${stateLine(s)}${canGoLive(w, s.role.id).ok ? '  [OK to create]' : '  [await allow_new_live]'}`);
      out(`recovery trigger: ${report.recoveryTrigger}`);
      break;
    }
    case 'budget': {
      const r = usageReport(w);
      out(`usage: ${r.usedPct}% used, ${r.remainingPct}% remaining (headroom ${r.headroom}%)  mode=${r.mode}`);
      out(`roles: ${r.totalRoles}  live=${r.eligibleLiveNow.length}  warm=${r.warmCount}  on-demand=${r.onDemandCount}  dormant=${r.dormantCount}  experimental=${r.experimentalCount}`);
      out('token caps:');
      for (const [k, v] of Object.entries(w.policy.token_budget_per_task)) out(`  ${k}: ${v} tok/task`);
      break;
    }
    case 'mode': {
      const st = readUsageState(ROOT, w.policy.used_pct);
      const b = modeFor(st.usedPercent);
      out(`mode: ${b.label}  (${st.usedPercent}% used / ${st.remainingPercent}% remaining)`);
      out(`live core: ${b.liveCore.join(', ')}`);
      out(`max specialists/request: ${b.maxSpecialistsPerRequest}`);
      out(`groups: ${b.groupsAllowed}`);
      out(`routines: ${b.routines}  (no routine may be enabled)`);
      out(`experimental blocked: ${b.experimentalBlocked}`);
      out(`proactive research: ${b.proactiveResearch ? 'enabled' : 'disabled'}`);
      out(b.notes);
      out(`on-demand billing: ${st.onDemandEnabled ? 'ENABLED (billing risk)' : 'off'}`);
      out(`end-of-cycle harvest: ${st.endOfCycleHarvest.enabled ? 'enabled' : 'off'}`);
      out(`reset date: ${st.resetDate ?? '(unknown)'}${st.resetDate ? ` (${daysUntilReset(st) ?? '?'} days)` : ''}`);
      break;
    }
    case 'usage':
    case 'usage:set': {
      if (cmd === 'usage:set') {
        const pct = Number(arg(0));
        if (arg(0) === undefined || Number.isNaN(pct)) throw new Error('usage: usage:set <pct 0-100>');
        const st = setUsageUsedPct(ROOT, pct);
        out(`usage:set ${st.usedPercent}%  remaining ${st.remainingPercent}%  mode=${modeFor(st.usedPercent).label}`);
        break;
      }
      const st = readUsageState(ROOT, w.policy.used_pct);
      out(`usage: ${st.usedPercent}% used / ${st.remainingPercent}% remaining  mode=${modeFor(st.usedPercent).label}`);
      out(`on-demand: ${st.onDemandEnabled ? 'on' : 'off'}  harvest: ${st.endOfCycleHarvest.enabled ? 'on' : 'off'}`);
      out(`last updated: ${st.lastUpdated}`);
      break;
    }
    case 'usage:reset': {
      const iso = arg(0);
      if (!iso) throw new Error('usage: usage:reset <YYYY-MM-DD>');
      const st = setResetDate(ROOT, iso);
      out(`reset date set: ${st.resetDate} (${daysUntilReset(st) ?? '?'} days)`);
      break;
    }
    case 'usage:ondemand': {
      const mode = arg(0);
      if (mode !== 'on' && mode !== 'off') throw new Error('usage: usage:ondemand on|off');
      const st = setOnDemandEnabled(ROOT, mode === 'on');
      out(`on-demand billing ${st.onDemandEnabled ? 'ENABLED' : 'off'} — ${st.onDemandEnabled ? 'BILLING RISK; human-declared' : ''}`);
      break;
    }
    case 'usage:harvest': {
      const mode = arg(0);
      if (mode !== 'on' && mode !== 'off') throw new Error('usage: usage:harvest on|off');
      const st = setHarvestEnabled(ROOT, mode === 'on');
      out(`end-of-cycle harvest ${st.endOfCycleHarvest.enabled ? 'enabled' : 'off'}`);
      break;
    }
    case 'rollout': {
      const r = rolloutReport(w);
      out(`rollout plan (plan-only; activates nothing)  [band ${r.band.label}]`);
      for (const p of r.phases) {
        out(`--- Phase ${p.phase} ${p.name} [when ${p.band.join(' or ')}] (now: ${p.now ? 'ACTIVE' : 'pending'})`);
        for (const id of p.roleIds) {
          const role = w.roles.get(id);
          if (role) out(`  ${id} ${role.name}${p.now ? `  ${roleState(w, id)?.state ?? ''}` : ''}`);
        }
        if (p.roleIds.length === 0) out('  (none)');
        out(`    condition: ${p.condition}`);
      }
      const a = allowedNow(w);
      out(`live now (${a.liveNow.length}): ${a.liveNow.map((id) => w.roles.get(id)?.name ?? id).join(', ')}`);
      out(`on-demand candidates (${a.allowedOnDemand.length}): ${a.allowedOnDemand.map((id) => w.roles.get(id)?.name ?? id).join(', ')}`);
      out('why-blocked (sample):');
      for (const b of a.whyBlocked.slice(0, 6)) out(`  ${b.id} ${w.roles.get(b.id)?.name ?? ''}: ${b.reason}`);
      if (a.whyBlocked.length > 6) out(`  … (${a.whyBlocked.length} total blocked)`);
      break;
    }
    case 'allowed': {
      const a = allowedNow(w);
      out(`live now (${a.liveNow.length}): ${a.liveNow.map((id) => w.roles.get(id)?.name ?? id).join(', ')}`);
      if (a.allowedOnDemand.length) out(`on-demand candidates (${a.allowedOnDemand.length}): ${a.allowedOnDemand.map((id) => w.roles.get(id)?.name ?? id).join(', ')}`);
      if (a.whyBlocked.length) {
        out('why blocked:');
        for (const b of a.whyBlocked) out(`  ${b.id} ${w.roles.get(b.id)?.name ?? ''}: ${b.reason}`);
      }
      break;
    }
    case 'packet': {
      const raw = process.argv.slice(3).join(' ');
      if (!raw) throw new Error('usage: packet <TASK|RESULT|ESCALATE|...>');
      const p = parsePacket(raw);
      out(serializePacket(p));
      out('valid: yes');
      out(`chatter: ${isChatter(raw) ? 'rejected (low signal)' : 'no'}`);
      break;
    }
    case 'compile': {
      for (const c of compileAll(w)) out(`${c.roleId}\t${c.name}\t${c.oneLine}\t${c.chars}c\t~${c.tokens}t`);
      break;
    }
    case 'profile': {
      const query = process.argv[3];
      if (!query) throw new Error('usage: profile <id|name>');
      const id = findRole(query, { loose: true });
      const p = buildProfile(w, id);
      if (!p) throw new Error(`no profile for ${query}`);
      out(renderProfile(p));
      break;
    }
    case 'groups': {
      out(`group templates (${w.groupTemplates.length}; never live groups, max 6 bots each):`);
      for (const t of w.groupTemplates) {
        const names = t.memberIds.map((id) => w.roles.get(id)?.name ?? id);
        const owner = w.roles.get(t.taskOwnerId)?.name ?? t.taskOwnerId;
        out(`- ${t.name} [owner ${owner}, ${t.memberIds.length} bots]\n    ${names.join(', ')}`);
      }
      break;
    }
    case 'routines': {
      out(`routine templates (${w.routineTemplates.length}; ALL disabled — graduation required):`);
      for (const t of w.routineTemplates) {
        const names = t.memberIds.map((id) => w.roles.get(id)?.name ?? id);
        out(`- ${t.name} cadence=${t.cadence} status=${t.status} enabled=${t.enabled} graduated=${t.graduated}`);
        out(`    members: ${names.join(', ')}`);
        out(`    purpose: ${t.purpose}  consumer: ${t.consumer}`);
        if (t.status !== 'template' || t.enabled) out('    !!! must stay template/disabled until graduation criteria are met (role ran manually ≥2×, genuine recurrence, real consumer)');
      }
      break;
    }
    case 'usage:log': {
      const roleName = arg(0);
      if (!roleName) throw new Error('usage: usage:log <role> [taskClass] [--useful|--not-useful] [--handoffs N] [--before N] [--after N] [--consumedBy X] [--notes "..."]');
      const id = findRole(roleName, { loose: true });
      const role = w.roles.get(id)!;
      const taskClass = arg(1) ?? 'task';
      const useful = hasFlag('--not-useful') ? false : true;
      const handoffs = Number(flagValue('--handoffs') ?? 0);
      const beforeRaw = flagValue('--before');
      const afterRaw = flagValue('--after');
      const before = beforeRaw !== undefined ? Number(beforeRaw) : readUsageState(ROOT, w.policy.used_pct).usedPercent;
      const after = afterRaw !== undefined ? Number(afterRaw) : null;
      const ev = appendUsageEvent(ROOT, {
        timestamp: new Date().toISOString(),
        usedPercentBefore: before,
        usedPercentAfter: after,
        role: role.name,
        taskClass,
        handoffs: Number.isFinite(handoffs) && handoffs >= 0 ? handoffs : 0,
        resultUseful: useful,
        resultConsumedBy: flagValue('--consumedBy') ?? 'human',
        notes: flagValue('--notes') ?? '',
      });
      const afterTxt = ev.usedPercentAfter !== null && ev.usedPercentAfter !== undefined ? `${ev.usedPercentAfter}%` : '?';
      out(`usage:log recorded → role=${ev.role} task=${ev.taskClass} useful=${ev.resultUseful} handoffs=${ev.handoffs} used ${ev.usedPercentBefore}%→${afterTxt} consumedBy=${ev.resultConsumedBy}`);
      out('honesty rule: only record percentages a human actually saw in Cursor; never invent token counts.');
      break;
    }
    case 'usage:report': {
      const { events, skipped } = readUsageEvents(ROOT);
      const s = summarizeUsageEvents(events, w, skipped);
      out(`usage events: ${s.total} recorded (${s.skipped} corrupt line(s) skipped) — human-declared only, no fabricated meter`);
      out('most useful roles by events:');
      if (s.mostUsefulRoles.length === 0) out('  (none recorded yet)');
      for (const r of s.mostUsefulRoles) out(`  ${r.role}: ${r.useful} useful`);
      out('least-used logged roles:');
      for (const r of s.leastUsedRoles) out(`  ${r.role}: ${r.events}`);
      out(`roles never used (of ${w.roles.size}): ${s.neverUsed.length} — ${s.neverUsed.slice(0, 8).join(', ')}${s.neverUsed.length > 8 ? ', …' : ''}`);
      out('high-cost/low-value patterns (>=2 handoffs AND not useful):');
      if (s.highCostLowValue.length === 0) out('  none — good');
      for (const h of s.highCostLowValue) out(`  ${h.role} ${h.taskClass}: ${h.handoffs} handoffs, useful=no, consumedBy=${h.consumed}, ${h.timestamp}`);
      out(`keep-warm candidates (useful + used >=2x): ${s.keepWarm.join(', ') || 'none'}`);
      out(`stay-virtual candidates (never used, non-core): ${s.virtualCandidates.join(', ') || 'none'}`);
      out('LOG AFTER EVERY TASK: pnpm grok usage:log <role> [--useful|--not-useful] [--handoffs N] [--after N]');
      break;
    }
    case 'should-create': {
      const query = arg(0);
      if (!query) throw new Error('usage: should-create <role>');
      const id = findRole(query, { loose: true });
      const d = shouldCreateDecision(w, id);
      out(`should-create ${d.name} (${d.id}) · band ${d.band} · materialization ${d.existingStatus}`);
      out(`eligible-live-now: ${d.eligibleNow ? 'yes' : 'no'} (${d.eligibleWhy})`);
      out(`VERDICT: ${d.verdict}`);
      out(`ACTION: ${d.code} — ${d.codeDescription}`);
      out('for:');
      if (d.reasonsFor.length === 0) out('  (none)');
      for (const r of d.reasonsFor) out(`  + ${r}`);
      out('against:');
      for (const r of d.reasonsAgainst) out(`  - ${r}`);
      out(`temporary carrier (existing chief): ${d.temporaryCarrier}`);
      out('pathway:');
      for (const s of d.pathway) out(`  - ${s}`);
      break;
    }
    case 'a2a-smoke': {
      const results = a2aSmokeTest(w);
      for (const r of results) {
        out(`${r.pass ? 'PASS' : 'FAIL'}  ${r.responder}`);
        out(`  TASK   ${A2A_SMOKE_SPEC.find((s) => s.responder === r.responder)?.taskLine ?? ''}`);
        out(`  RESULT ${r.canonicalResultLine}`);
        for (const f of r.hierarchyFacts) out(`  expect ${f}`);
        out(`  checks: ${r.notes.join(' · ')}`);
      }
      const all = results.every((r) => r.pass);
      out(`a2a-smoke: ${all ? 'ALL PASS' : 'FAILURES'} — re-run bootstrap after any registry change`);
      process.exit(all ? 0 : 1);
      break;
    }
    case 'roster': {
      out(`${liveRosterMd(w).trim()}`);
      break;
    }
    case 'dashboard': {
      const r = writeDashboard(w);
      out(`dashboard written: ${r.path} (${r.bytes} bytes) — open in a browser. Read-only snapshot; regenerates only on demand.`);
      break;
    }
    case 'doctor': {
      const issues: string[] = [];
      // 1. integrity + escalation
      const { checked, failed } = assertAllChainToHuman(w);
      if (failed.length) issues.push(`escalation failures: ${failed.join(',')}`);
      // 2. ids unique + parseable small set, parents resolve
      const ids = [...w.roles.keys()];
      if (ids.length !== new Set(ids).size) issues.push('duplicate role ids');
      for (const id of ids) {
        const p = w.parent.get(id);
        if (p === undefined) issues.push(`orphan role ${id}`);
        else if (p !== 'human' && p !== 'agentos' && p !== 'orgos' && !w.roles.has(p)) issues.push(`unresolved parent ${p} for ${id}`);
      }
      // 3. cycle check (walk up until anchor or repeat)
      const ANCHORS = new Set(['human', 'agentos', 'orgos']);
      for (const id of ids) {
        const seen = new Set<string>();
        let hop: string | undefined = id;
        let cyclic = false;
        while (hop) {
          if (seen.has(hop)) { cyclic = true; break; }
          seen.add(hop);
          const p = w.parent.get(hop);
          if (p === undefined || ANCHORS.has(p)) break;
          if (!w.roles.has(p)) break;
          hop = p;
        }
        if (cyclic) issues.push(`cyclic parent chain from ${id}`);
      }
      // 4. groups: <=6, owner is member, names resolved (load enforces)
      for (const t of w.groupTemplates) {
        if (t.memberIds.length > 6) issues.push(`group ${t.name} > 6 bots`);
        if (!t.memberIds.includes(t.taskOwnerId)) issues.push(`group ${t.name} owner not member`);
      }
      // 5. routines: disabled, status template
      for (const t of w.routineTemplates) {
        if (t.enabled) issues.push(`routine ${t.name} enabled (must be off)`);
        if (t.status !== 'template') issues.push(`routine ${t.name} status ${t.status} (must be template)`);
      }
      // 6. security: HS roles have restrictive clauses + listed correctly
      for (const name of w.security.highly_sensitive_roles ?? []) {
        const role = [...w.roles.values()].find((r) => r.name === name);
        if (!role) { issues.push(`highly_sensitive_roles unknown role ${name}`); continue; }
        const c = compileRole(w, role.id)!;
        if (!c.prompt.includes('SENSITIVE:')) issues.push(`${name} missing SENSITIVE clause`);
        if (c.prompt.split('\n').length > 5) issues.push(`${name} prompt >5 lines`);
        if (role.dataClass !== 'highly_sensitive') issues.push(`${name} dataClass not highly_sensitive`);
      }
      // 7. mode from 79 => CONSERVE
      const report = usageReport(w);
      const snap = readUsageState(ROOT, w.policy.used_pct);
      const b = modeFor(snap.usedPercent);
      if (snap.usedPercent < 75 || snap.usedPercent > 89) issues.push('doctor: used% not in CONSERVE band — expected ~79');
      if (report.mode !== 'CONSERVE') issues.push(`doctor: mode ${report.mode} != CONSERVE`);
      const three = ['01', '02', '03'];
      if (report.eligibleLiveNow.map((s) => s.role.id).sort().join(',') !== three.join(',')) issues.push('doctor: eligible live != 01,02,03');
      // 8. experimental blocked in conserve
      for (const s of report.eligibleLiveNow) if (s.role.activation === 'experimental') issues.push(`experimental ${s.role.id} live in conserve`);
      // 9. webhook secrets absent from repo (env only)
      const leaked = Object.keys(process.env).filter((k) => k.startsWith('GROKBOT_') && k.endsWith('_WEBHOOK_KEY'));
      if (leaked.length) issues.push('webhook keys present in env — verify they are NOT committed');
      // 10. profiles compact + no duplicate description drift
      const all = buildAllProfiles(w);
      const overlong = all.filter((p) => p.chars > 900 || p.lines > 5);
      if (overlong.length) issues.push(`overlong profiles: ${overlong.map((p) => p.name).join(',')}`);
      const dupes = new Map<string, string>();
      for (const p of all) {
        const k = p.description.replace(/ROLE: [A-Za-z]+/, 'ROLE: X');
        if (dupes.has(k)) issues.push(`twin profile descriptions: ${dupes.get(k)} & ${p.name}`);
        else dupes.set(k, p.name);
      }
      // 11. export deterministic content (no timestamps in profile artifacts)
      const snap1 = writeProfiles(w).profiles.map((p) => p.chars + ':' + p.name + ':' + p.lines + ':' + p.state);
      const snap2 = writeProfiles(w).profiles.map((p) => p.chars + ':' + p.name + ':' + p.lines + ':' + p.state);
      if (snap1.join('|') !== snap2.join('|')) issues.push('profile export not deterministic');
      // 12. usage-events log parses cleanly (honest telemetry)
      const { skipped: evSkipped } = readUsageEvents(ROOT);
      if (evSkipped > 0) issues.push(`usage-events log has ${evSkipped} corrupt line(s)`);

      out(`doctor: ${issues.length === 0 ? 'ALL CHECKS PASS' : `${issues.length} issues`}`);
      for (const i of issues) out(`  ✗ ${i}`);
      out(`summary: ${checked} roles / ${w.anchors.size} anchors / ${w.groupTemplates.length} groups / ${w.routineTemplates.length} routines / ${report.mode} / eligible ${report.eligibleLiveNow.map((s) => s.role.id).join(',')}`);
      process.exit(issues.length ? 1 : 0);
      break;
    }
    case 'webhook': {
      const sub = arg(0);
      if (sub !== 'status') throw new Error('usage: webhook status <role>');
      const roleName = arg(1);
      if (!roleName) throw new Error('usage: webhook status <role>');
      const st = statusFor(roleName);
      out(`role: ${roleName}  state: ${st.state}  url configured: ${st.configured}  key present: ${st.keyPresent ? 'yes (kept secret)' : 'no'}`);
      if (st.runUuid) out(`last accepted runUuid: ${st.runUuid}`);
      if (st.error) out(`last error: ${st.error}`);
      if (st.configured) out('NOTE: HTTP 200 = accepted + run started, NOT completion. Check Run history for the result.');
      break;
    }
    case 'materialize:plan': {
      const query = arg(0);
      if (!query) throw new Error('usage: materialize:plan <id|name>');
      const id = findRole(query, { loose: true });
      const plan = materializePlan(w, id);
      out(`materialize:plan ${plan.name} (${plan.id}) [${plan.currentStatus}]`);
      out(`creation channel: ${plan.creationChannel}`);
      out(plan.channelNote);
      out(`adapter flag: ${plan.adapterFlag.verdict}`);
      out(`live-eligible: ${plan.liveEligible ? plan.liveEligibleWhy : `no — ${plan.liveEligibleWhy}`}`);
      out(plan.steps.join('\n'));
      break;
    }
    case 'materialize:set': {
      const query = arg(0);
      const status = arg(1);
      if (!query) throw new Error('usage: materialize:set <id|name> <status>');
      if (!status || !MATERIALIZATION_STATUSES.includes(status as (typeof MATERIALIZATION_STATUSES)[number])) throw new Error(`status must be one of: ${MATERIALIZATION_STATUSES.join(', ')}`);
      const id = findRole(query);
      const st = writeMaterializationStatus(ROOT, id, status as never);
      out(`materialized: ${id} -> ${st[id]}`);
      const role = w.roles.get(id);
      if (role && status === 'live_verified') out(`accepted ${role.name} as live_verified. CAUTION: a human must have confirmed the bot actually answers.`);
      break;
    }
    case 'integrations': {
      out('integration boundary adapters (feature-flag: GROK_FEATURE_INTEGRATIONS=1 to enable):');
      out('  AgentOS: ' + JSON.stringify(agentosAdapter(), null, 2));
      out('  OrgOS: ' + JSON.stringify(orgosAdapter(), null, 2));
      out('  PAIOS: ' + JSON.stringify(paiosAdapter(w), null, 2));
      out('  RevenueOS: ' + JSON.stringify(revenueosAdapter(w), null, 2));
      break;
    }
    case 'export': {
      const dry = process.argv.includes('--dry');
      const r = writeGenerated(w, !dry);
      out(`generated ${r.files.length} files (dry=${dry}):`);
      for (const f of r.files) out(`  ${f}`);
      const p = writeProfiles(w);
      out(`  + ${p.profiles.length} profile cards → generated/profiles/<id>.md, profiles.json, ALL_ROLES.md, TOP_ROLES.md`);
      if (!dry) {
        writePaiosDescriptor(w);
        writeRevenueDiscovery(w);
        out(`  + generated/paios-grokbot-office-descriptor.md (PROPOSAL — read-only) + generated/revenueos-role-discovery.json`);
      }
      out(`roles=${r.roles} anchors=${r.anchors} states=${JSON.stringify(r.states)} escalation-failed=${r.escalation.failed.length} headroom=${r.headroomPct}%`);
      break;
    }
    case 'bootstrap': {
      // write the bootstrap package, then auto-advance state to package_ready (monotonic; never past it).
      const pkg = writeBootstrap(w);
      out(`wrote ${pkg.files.length} files (${pkg.totalBytes} bytes) → ${pkg.dir}`);
      for (const f of pkg.files) out(`  ${f.rel}  ${f.bytes}B${f.rel === 'SHA256SUMS.txt' ? '' : ''}`);
      out(`checksums verified: ${pkg.checksumsVerified ? 'yes' : 'NO — run doctor'}`);
      const st = advanceToPackageReady(ROOT);
      out(`bootstrap state: ${st.record.status}`);
      break;
    }
    case 'bootstrap:status': {
      const st = readBootstrapState(ROOT);
      out(`status: ${st.status}  updated: ${st.updatedAt}${st.note ? `  note: ${st.note}` : ''}`);
      break;
    }
    case 'bootstrap:set': {
      const next = arg(0);
      if (!next) throw new Error('usage: bootstrap:set <status> [--confirm]');
      if (!isBootstrapStatus(next)) throw new Error(`unknown status: ${next} (one of: ${BOOTSTRAP_STATUSES.join(', ')})`);
      const r = setBootstrapStatus(ROOT, next, { confirm: hasFlag('--confirm') });
      if (!r.ok) throw new Error(r.why);
      out(`${r.why}  (${r.record.status})`);
      break;
    }
    case 'bridge:check': {
      const r = bridgeCheck(ROOT);
      out(formatBridgeReport(r));
      out(`exit: ${r.verdict === 'READY' ? 0 : 1}`);
      process.exit(r.verdict === 'READY' ? 0 : 1);
    }
    case 'bridge:bundle': {
      const b = bridgeBundle(w, ROOT);
      out(`tar: ${b.tar}`);
      out(`manifest: ${b.manifest}`);
      out(`generatedAt: ${b.report.generatedAt}`);
      out(`archive: ${b.report.archiveBytes} bytes  sha256 ${b.report.archiveSha256}`);
      out(`files: ${b.report.fileCount}`);
      for (const f of b.report.files) out(`  ${f.path}  ${f.bytes}B`);
      break;
    }
    case 'create-card': {
      const q = arg(0);
      if (!q) throw new Error('usage: create-card <role id|name>');
      const id = findRole(q, { loose: true });
      const card = createCardFor(w, id);
      if (!card) throw new Error(`no create-card for ${id}`);
      out(`NAME: ${card.name}`);
      out(`TITLE: ${card.title}`);
      out(`DESCRIPTION: ${card.description}`);
      out(`SMOKE TEST: ${card.smokeTest}`);
      out(`NEXT MESSAGE: ${card.nextMessage}`);
      break;
    }
    default:
      out(usage);
  }
} catch (e) {
  out((e as Error).message);
  process.exit(1);
}