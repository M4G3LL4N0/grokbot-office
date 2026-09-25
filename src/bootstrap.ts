// GrokBot Office — portable bootstrap package generator (Part 4).
// Builds generated/bootstrap/ : a small, deterministic, secret-free bundle a
// ChiefOfStaff GrokBot can read and operate from WITHOUT the TypeScript source.
// Everything below is derived from the registry + config + persisted usage;
// nothing is hardcoded here beyond formatting. No bot is created, messaged, or
// activated by this module.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './paths.js';
import type { Workforce } from './registry.js';
import { readUsageState } from './usage.js';
import { usageReport } from './budget.js';
import { chiefs } from './hierarchy.js';
import { serializePacket } from './packets.js';
import { readMaterialization } from './materialization.js';
import { a2aSmokeTest, A2A_SMOKE_SPEC, SMOKE_ANSWER_ACCEPTANCE } from './a2a-smoke.js';

/** Creation-card message telling ChiefOfStaff where the canonical package lives. */
export const NEXT_MESSAGE_CHIEF =
  'Once this repository is on your cloud computer (or you receive the bootstrap ' +
  'package), open generated/bootstrap/README_FIRST.md and follow ' +
  'GROKBOT_BOOTSTRAP_PROMPT.md exactly. Do not create any other Bot yet. ' +
  'Report readiness to the human with a RESULT.';

export interface CreateCard {
  name: string;
  title: string;
  description: string;
  smokeTest: string;
  nextMessage: string;
}

export interface BootstrapFile {
  rel: string;
  content: string;
  bytes: number;
  sha256: string;
}

export interface BootstrapPackage {
  dir: string;
  files: BootstrapFile[];
  totalBytes: number;
  /** true when every entry in SHA256SUMS.txt re-hashes to the stored digest */
  checksumsVerified: boolean;
}

const sha = (content: string): string => createHash('sha256').update(content).digest('hex');

export const bootstrapDir = (root = ROOT): string => join(root, 'generated', 'bootstrap');

/** Resolve the routing hub role id (by name; ChiefOfStaff default). */
export const hubRoleId = (w: Workforce): string => {
  const byName = [...w.roles.values()].find((r) => r.name === w.routing.hub);
  return byName?.id ?? '01';
};

/* ------------------------------------------------------------------ */
/* compact exports                                                     */
/* ------------------------------------------------------------------ */

export function rolesCompactJson(w: Workforce): string {
  const roles = [...w.roles.values()]
    .map((r) => ({
      id: r.id,
      name: r.name,
      title: r.title,
      domain: r.domain,
      tier: r.tier,
      priority: r.priority,
      activation: r.activation,
      parent: w.parent.get(r.id) ?? '',
      budget: r.budgetClass,
      approval: r.approvalBoundary,
      data: r.dataClass,
      handoffs: r.maxHandoffs,
      mission: r.mission,
    }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return JSON.stringify(
    { generatedFrom: 'registry/roles.yaml + config/*', count: roles.length, anchors: ['human', 'agentos', 'orgos'], roles },
    null,
    1,
  );
}

export function hierarchyCompactJson(w: Workforce): string {
  const parent: Record<string, string> = {};
  for (const id of w.roles.keys()) parent[id] = w.parent.get(id) ?? '';
  return JSON.stringify(
    {
      generatedFrom: 'registry/roles.yaml parent links',
      anchors: [...w.anchors.values()].map((a) => ({ id: a.id, name: a.name, parent: a.parent, note: a.note })),
      chiefs: chiefs(w).map((r) => r.id),
      parent,
      escalationChain: ['specialist', 'chief', 'ChiefOfStaff', 'human'],
    },
    null,
    1,
  );
}

export function groupsCompactJson(w: Workforce): string {
  return JSON.stringify(
    {
      generatedFrom: 'config/groups.yaml',
      groupTemplates: w.groupTemplates.map((t) => ({
        name: t.name,
        owner: t.taskOwnerId,
        members: t.memberIds,
        purpose: t.purpose,
      })),
      explicitGroups: Object.entries(w.groups.explicit_groups ?? {}).map(([name, g]) => ({
        name,
        members: g.members,
        purpose: g.purpose,
      })),
      routineTemplates: w.routineTemplates.map((t) => ({
        name: t.name,
        cadence: t.cadence,
        status: t.status,
        enabled: t.enabled,
        graduated: t.graduated,
        members: t.memberIds,
        purpose: t.purpose,
        consumer: t.consumer,
      })),
      maxGroupSize: 6,
    },
    null,
    1,
  );
}

export function usagePolicyCompactJson(w: Workforce): string {
  const rep = usageReport(w);
  const state = readUsageState(ROOT, w.policy.used_pct);
  const band = rep.band;
  const wave1 = band.liveCore.map((id) => w.roles.get(id)?.name ?? id);
  return JSON.stringify(
    {
      generatedFrom: 'state/usage.json + config/usage-policy.yaml',
      usedPercent: rep.usedPct,
      remainingPercent: rep.remainingPct,
      resetDate: state.resetDate,
      onDemandEnabled: state.onDemandEnabled,
      endOfCycleHarvestEnabled: state.endOfCycleHarvest.enabled,
      mode: rep.mode,
      wave1LiveNow: wave1,
      maxLiveRoles: w.policy.conservation.max_live_roles,
      allowNewLive: w.policy.conservation.allow_new_live,
      maxSpecialistsPerRequest: rep.maxSpecialistsPerRequest,
      groupsAllowed: band.groupsAllowed,
      routines: band.routines,
      experimentalBlocked: band.experimentalBlocked,
      proactiveResearch: band.proactiveResearch,
      bands: [
        { label: 'EXPLORE', range: '0-24', liveCore: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'], maxSpecialists: 4, groups: 'yes', routines: 'candidate', experimentalBlocked: false },
        { label: 'NORMAL', range: '25-49', liveCore: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'], maxSpecialists: 3, groups: 'limited', routines: 'candidate', experimentalBlocked: false },
        { label: 'CONSERVE_LIGHT', range: '50-74', liveCore: ['01', '02', '03', '04', '05'], maxSpecialists: 2, groups: 'limited', routines: 'off', experimentalBlocked: true },
        { label: 'CONSERVE', range: '75-89', liveCore: ['01', '02', '03'], maxSpecialists: 1, groups: 'never', routines: 'off', experimentalBlocked: true },
        { label: 'CRITICAL', range: '90-100', liveCore: ['01'], maxSpecialists: 1, groups: 'never', routines: 'off', experimentalBlocked: true },
      ],
      recovery: { usedUnderPct: w.policy.conservation.recovery_trigger.used_under_pct, sustainedDays: w.policy.conservation.recovery_trigger.sustained_days },
      tokenBudget: w.policy.token_budget_per_task,
    },
    null,
    1,
  );
}

export function securityCompactMd(w: Workforce, wave1: string): string {
  const sec = w.security;
  const hs = sec.highly_sensitive_roles ?? [];
  return [
    '# Security compact',
    '',
    `- Data classes: ${Object.entries(sec.data_class_by_domain).map(([k, v]) => `${k}=${v}`).join(', ')}.`,
    `- Highly sensitive roles (${hs.length}): ${hs.join(', ')} — compiled prompt carries the SENSITIVE clause; never raw data in chat; metadata/pointers only.`,
    `- Non-autonomous (human only): ${sec.no_autonomous.join(', ')}.`,
    `- Privileged actions require approval: ${sec.privileged_actions_require_approval.join(', ')}.`,
    `- Secrets: ${sec.secrets_policy.transport.join(' / ')} only; never in prompts/config/git; redact on failure.`,
    `- Sensitive data: ${Object.entries(sec.sensitive_data_handling).map(([k, v]) => `${k}=${v}`).join('; ')}.`,
    `- Approval-boundary human_approval roles: ${Object.keys(sec.approval_overrides ?? {}).length}.`,
    '',
    '- Shared cloud computer is NOT a security boundary (all Bots share files/browser/logins under one user).',
    `- Wave 1 live roles: ${wave1}.`,
    '',
  ].join('\n');
}

export function a2aCompactMd(w: Workforce): string {
  const t = serializePacket({ kind: 'TASK', from: 'ChiefOfStaff', to: 'ProjectsChief', goal: 'goal', context: 'context', constraints: 'no prod writes', deliverable: 'RESULT' });
  const r = serializePacket({ kind: 'RESULT', from: 'ProjectsChief', to: 'ChiefOfStaff', facts: ['f1', 'f2'], action: 'recommend', confidence: 0.9 });
  const e = serializePacket({ kind: 'ESCALATE', from: '20xx.orb', issue: 'issue', whyHuman: 'needs human approval', options: ['a', 'b'] });
  return [
    '# A2A compact (agent-to-agent law)',
    '',
    'Law: specialist → domain chief → ChiefOfStaff → human. Single owner per stage.',
    `Escalation chain: ${w.routing.escalation_chain.join(' → ')}. Hub: ${w.routing.hub}.`,
    `Banned traffic: ${w.routing.banned_traffic.join(', ')}. No greetings, no acknowledgements, no summaries-of-summaries.`,
    `Cross-route: chiefs may cross-route when the owning chief agrees (${w.routing.cross_route.gate}).`,
    `Direct peer only when ${w.routing.direct_peer_allowed_when.join(' + ')}.`,
    '',
    'Canonical packets (pipe format, round-trip):',
    `  TASK     ${t}`,
    `  RESULT   ${r}`,
    `  ESCALATE ${e}`,
    '',
    'RESULT header is requester→responder (to→from): the responder answers the requester.',
    'Confidence 0..1; >=0.8 is a recommendation, not a verdict. ESCALATE targets human approval.',
    '',
    `Routing: keyword blocks in config/routing.yaml; unrouted default = ${w.routing.unrouted_default}.`,
    'Groups: max 6 Bots (Cursor limit), one named task owner, one merged output, only when multiple perspectives must share live state.',
    '',
  ].join('\n');
}

export function readmeFirstMd(w: Workforce, wave1names: string[]): string {
  return [
    '# README FIRST — GrokBot Office bootstrap package',
    '',
    'You are reading the CANONICAL, self-contained description of the grokbot-office',
    'workforce. The repository (or this package) is the authoritative source. Local',
    'machine paths do not exist on the cloud computer; transfer the package',
    'through an owner-approved channel.',
    '',
    `Contents: roles=${w.roles.size}, anchors=human/agentos/orgos, groups (templates ≤6 Bots), routines (all disabled — ${w.routineTemplates.length} templates).`,
    `Current usage: ${w.policy.used_pct}% used rate, actual state file may adjust; wave 1 live roles: ${wave1names.join(', ')}.`,
    '',
    'Procedure for the human:',
    '1. Create ChiefOfStaff (New / Cmd+N → Create new agent → Edit Profile, paste CHIEF_OF_STAFF_PROFILE.md).',
    '2. Send the SMOKE TEST line from the profile card as the FIRST message.',
    '3. Only mark the Bot live in the repo after its smoke answer is correct and bounded.',
    '',
    'Procedure for ChiefOfStaff:',
    '1. Read GROKBOT_BOOTSTRAP_PROMPT.md and follow it exactly.',
    '2. Consume roles.compact.json / hierarchy.compact.json / groups.compact.json / usage-policy.compact.json.',
    '3. Create no more than ProjectsChief + IntelligenceChief now; verify them; stop and report.',
    '4. Never invent unsupported Bot creation. Use native focused-Bot creation only where officially supported, with human confirmation.',
    '5. Never copy credentials or secrets into prompts. Never mark a Bot live before you verified it answers.',
    '',
    'Integrity: SHA256SUMS.txt verifies every file in this package. All content is deterministic and secret-free.',
    '',
  ].join('\n');
}

export function bootstrapPromptMd(w: Workforce, wave1names: string[]): string {
  const rep = usageReport(w);
  return [
    '# GROKBOT BOOTSTRAP PROMPT — ChiefOfStaff (CANONICAL)',
    '',
    'Source: generated from registry/roles.yaml + config/* + state/usage.json.',
    'This package and its repository are the authoritative definition of the workforce.',
    '',
    'ROLE DATA (from compact files in this package):',
    `- roles.count = ${w.roles.size}; anchors human/agentos/orgos (hierarchy.compact.json).`,
    `- usage now = ${rep.usedPct}% USED / ${rep.remainingPct}% remaining.`,
    `- mode = ${rep.mode} (band ${rep.band.minUsedPct}-${rep.band.maxUsedPct}). Wave 1 live roles = ${wave1names.join(', ')}.`,
    `- allow_new_live = ${w.policy.conservation.allow_new_live}; max specialists/request = ${rep.maxSpecialistsPerRequest}.`,
    '',
    'DIRECTIVES (follow exactly; do not skip):',
    '1. This repository/package is authoritative. Read roles.compact.json, hierarchy.compact.json, groups.compact.json, usage-policy.compact.json before operating.',
    `2. Current usage = ${rep.usedPct}% USED. Every action consumes allowance; preserve it.`,
    `3. Mode = ${rep.mode}. Only the Wave 1 live roles may exist as Bots now.`,
    '4. Create no more than ProjectsChief + IntelligenceChief now (plus yourself already exists). Do NOT create any other Bot.',
    '5. No routines. No schedules. No recurring background runs.',
    '6. No speculative background work. Human-initiated work only.',
    '7. No experimental agents (all activation=experimental roles stay virtual).',
    '8. No group chats unless a task truly needs multiple perspectives sharing live state (groups.compact.json; max 6 Bots, one owner).',
    '9. Specialists remain virtual/on-demand. Do not spawn specialists without a real task and human confirmation.',
    '10. Use native GrokBot A2A (async bot-to-bot messages, group chats, ownership passing) — no custom orchestrator exists.',
    '11. Use native focused-Bot creation ONLY where officially supported, and only with human confirmation in the UI.',
    '12. Never invent unsupported Bot creation mechanisms (no undocumented gateways, no scripts against hidden APIs).',
    '13. Preserve the hierarchy: route and escalate exactly as hierarchy.compact.json / A2A.compact.md define.',
    '14. Communicate only in compact TASK/RESULT/ESCALATE packets (A2A.compact.md). No greetings, no chatter.',
    '15. Never copy credentials/secrets into prompts or conversations. Hand off secrets via env/connectors only.',
    '16. The shared computer is NOT a security boundary. Treat every artifact as visible to all Bots.',
    '17. Verify a Bot BEFORE reporting it live: run its SMOKE TEST, confirm the answer is correct and bounded.',
    '18. Stop after Wave 1. Report status to the human with a RESULT (what is live, what is verified, what is blocked).',
    '',
    'If anything is ambiguous, escalate to the human. Do not guess.',
    '',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Part B — activation guides (deterministic, registry-derived)        */
/* ------------------------------------------------------------------ */

/** Wave-2 creation order (mission item 3). PrivateChiefOfStaff is gated last. */
export const WAVE2_ORDER = ['08', '06', '07', '09', '10', '04', '05', '43'] as const;

const wave2Why: Record<string, string> = {
  '08': 'Truth-check gate for the whole workforce: every high-impact claim/status should be V/PARTIAL/FALSE/UNKNOWN-verified. A durable RealityAuditor prevents compounded misinformation and gives Wave 2 legitimacy.',
  '06': 'Earns a standing hub the moment research repeats instead of being one-off. It is the parent for DeepResearcher, Scientist, CompetitorAutopsy-class work and turns questions into minimum-cost plans.',
  '07': 'Repeated work IS the recurring-value signal the specialist policy keys on. A durable owner detects, automates, and retires tooling with measured savings — otherwise every session re-discovers the same repetition.',
  '09': 'Institutional/personal memory is persistent by nature: one owner keeps it compact, connected, and useful across sessions. Without it, knowledge fragments inside each conversation.',
  '10': 'Cost waste exists the moment the office actually operates. A durable owner audits subscriptions/spend/procurement with a distinct approval boundary instead of one-off audits.',
  '04': 'Personal logistics (travel, purchasing, scheduling, knowledge, errands) is genuinely recurring daily-life work. It earns persistence only when that demand is real and recorded.',
  '05': 'Family office work is periodic and high-stakes: assets, admin, risk, legal, tax, insurance, estate, philanthropy. A hub is justified once real asset/admin/risk tracking and specialist flows repeat.',
  '43': 'Only ever created when real personal-office demand exists (usage band loosens AND recurring private work is logged). Aggregates the office into one principal-facing hub — the LAST wave-2 creation, never speculative.',
};

export function wave2QueueMd(w: Workforce): string {
  const rows = WAVE2_ORDER.map((id) => {
    const r = w.roles.get(id);
    if (!r) return [];
    const gate =
      id === '43'
        ? '\n  CREATION GATE: real personal-office demand only (usage band ≤ CONSERVE and recurring private work logged via `pnpm grok usage:log`).'
        : '';
    return [
      `### ${id} — ${r.name}`,
      `- Mission: ${r.mission}`,
      `- Parent: ChiefOfStaff · activation ${r.activation} · priority ${r.priority}`,
      `- Why it earns persistence: ${wave2Why[id] ?? 'See mission.'}${gate}`,
      `- Create via: \`pnpm grok should-create ${r.name}\` then \`pnpm grok materialize:set ${id} live_verified\` after human confirmation.`,
      '',
    ];
  }).flat();

  return [
    '# WAVE 2 CREATION QUEUE — only after Wave 1 verified',
    '',
    `Wave 1 (now): ${usageReport(w).band.liveCore.map((id) => w.roles.get(id)?.name ?? id).join(', ')} — these are the ONLY Bots now.`,
    '',
    'Wave 2 may proceed per-role ONLY when ALL hold: (1) Wave 1 verified (bootstrap state `wave1_verified`), (2) usage band ≤ CONSERVE_LIGHT (≤74%), (3) the specific capability has a logged real demand (at least one `usage:log`).',
    'Wave 2 is per-role, never bulk. Create in this order; each role must pass its smoke test before the next.',
    '',
    ...rows,
    'Policy: no role beyond `wave1_verified` is created without a logged demand AND human confirmation in the UI. See SPECIALIST_CREATION_POLICY.md.',
    '',
  ].join('\n');
}

export function liveRosterMd(w: Workforce): string {
  const report = usageReport(w);
  const mat = readMaterialization();
  const wave1 = report.band.liveCore.map((id) => ({
    id,
    role: w.roles.get(id),
    status: mat[id] ?? 'registry_only',
  }));

  const rows = wave1.map((x) => {
    const name = x.role?.name ?? x.id;
    const mark =
      x.status === 'live_verified'
        ? 'LIVE (verified)'
        : x.status === 'live_unverified'
          ? 'LIVE (unverified — needs verification)'
          : 'PENDING (wave-1 selected; awaiting human confirmation)';
    return `| ${x.id} | ${name} | ${mark} |`;
  });

  const virtual = report.totalRoles - report.eligibleLiveNow.length;
  const wave2 = WAVE2_ORDER.map((id) => w.roles.get(id)?.name ?? id);
  return [
    '# LIVE ROSTER — what is actually a Bot (source of truth: state/materialization.json)',
    '',
    `Usage band: ${report.mode} (${report.usedPct}% used). Live core now: ${wave1.map((x) => x.role?.name).filter(Boolean).join(', ')}.`,
    '',
    '| # | Role | Real-world status |',
    '|:--|------|-------------------|',
    ...rows,
    `| — | all other ${virtual} roles | registry-only / virtual |`,
    '',
    `Wave-2 queue (not live): ${wave2.join(', ')} — see WAVE2_QUEUE.md for the gate.`,
    '',
    'How to update: a HUMAN marks a bot live only after the bot actually answered its smoke test:',
    '  pnpm grok materialize:set <id> live_verified',
    'Then regenerate this file: pnpm grok bootstrap (writes LIVE_ROSTER.md into the package).',
    'Nothing here creates, messages, or activates anything.',
    '',
  ].join('\n');
}

function activateNowMd(w: Workforce, wave1names: string[]): string {
  const cos = wave1names[0] ?? 'ChiefOfStaff';
  const wave1rest = wave1names.slice(1).join(' + ');
  return [
    '# ACTIVATE NOW — one screen, 10 steps (do them in order)',
    '',
    `Right now usage = ${w.policy.used_pct}% → ${usageReport(w).mode}. Only ${wave1names.join(', ')} may exist as Bots. Everything below stays local: no bot is created, messaged, or activated by running these commands — they record state after a HUMAN sees a real answer.`,
    '',
    '1. **Read README_FIRST.md** (whole file) and this one. Do not skip.',
    `2. **Make the package readable on the cloud computer** — copy \`generated/bootstrap/\` or transfer the public package through an owner-approved channel (see SETUP_GROKBOT_COMPUTER.md). Never paste credentials into prompts.`,
    `3. **Create the ChiefOfStaff Bot** — Cmd+N → Create new agent → Bot actions → Edit Profile → paste CHIEF_OF_STAFF_PROFILE.md in full.`,
    `4. **Send the SMOKE TEST line** from the profile card as the FIRST message. Accept one bounded line only.`,
    `5. **On real success** mark it: \`pnpm grok materialize:set 01 live_verified\`. This is a human claim that the bot actually answered.`,
    `6. **Operate it**: send GROKBOT_BOOTSTRAP_PROMPT.md to ${cos}. It must NOT create anything else yet.`,
    `7. **Create the two wave-1 reports** (native focused-Bot creation, human-confirmed in the UI): ${wave1rest}.`,
    `8. **Verify each** with its own smoke test, then run \`pnpm grok a2a-smoke\` and \`pnpm grok materialize:set 02/03 live_verified\` per real success.`,
    `9. **Confirm wave 1 is real**: \`pnpm grok bootstrap:set wave1_created --confirm\` then \`pnpm grok bootstrap:set wave1_verified --confirm\`.`,
    '10. **STOP.** All other roles stay registry-only/virtual. Wave 2 only per WAVE2_QUEUE.md when the band and a logged demand allow.',
    '',
    `Non-negotiables: verify BEFORE marking live (step 8); never invent bot creation; the shared computer is NOT a security boundary; never copy secrets into chats.`,
    '',
  ].join('\n');
}

function specialistPolicyMd(w: Workforce): string {
  const rep = usageReport(w);
  return [
    '# SPECIALIST CREATION POLICY — chiefs run the specialty first',
    '',
    'Default: **the existing chief executes the specialty itself.** A dedicated Bot is created only when the job shows at least one of:',
    '- recurring work — the same task repeats across weeks, not one-off',
    '- durable context — memory ACROSS tasks is the whole value',
    '- distinct tools/session — the work needs its own environment or logins',
    '- different approval boundary — its own escalation/approval signal',
    '- parallel workload — it must run concurrently with other agents',
    '- justified routine — only a routine that already graduated from manual proof (real consumer, repeated ≥2× manually)',
    '',
    'Otherwise: run it through the chief as a **TEMPORARY ROLE** for the task only — "ACT AS <name> for this task only. Scope, do, report, stop." Re-decide when the same temporary work recurs ~3× across weeks OR usage drops a band.',
    '',
    `Budget-law at ${rep.mode} (${rep.usedPct}% used): only ${rep.band.liveCore.join(', ')} (${rep.eligibleLiveNow.length} roles) may be live; everything else is a virtual role. \`pnpm grok should-create <role>\` prints the usage-aware ACTION code (CREATE_NOW / USE_TEMPORARY_ROLE / DEFER_UNTIL_RESET / BLOCKED_BY_USAGE / NEEDS_HUMAN_APPROVAL).`,
    '',
    'Durability is earned, not assumed: persistence without a logged recurring demand is the anti-pattern (dormant bots cost budget and decay).',
    '',
  ].join('\n');
}

function setupGrokbotComputerMd(w: Workforce): string {
  const rep = usageReport(w);
  return [
    '# SETUP THE GROKBOT CLOUD COMPUTER (read-mostly working copy)',
    '',
    'Canonical package location: the directory containing this package (do not copy local machine paths).',
    '',
    '1. If an owner-approved project remote exists, transfer the public repository through that remote.',
    '   Do not assume an inherited parent remote is the project remote.',
    '   Keep the cloud copy read-mostly; never force or push from the cloud.',
    '2. If there is no verified project remote: transfer only the public bootstrap package (`generated/bootstrap/`) or a reviewable bundle. state/ is gitignored and machine-local; do not copy it (it would go stale).',
    '3. Credentials: never embed them in prompts, config, or git. GitHub: use an authenticated session / credential helper (gh auth), never a token in a file.',
    '',
    '# SYNC MODEL (who edits what)',
    '',
    '- Mac/OpenCode = **authoritative editing**. Registry/config/docs change here only. state/ (usage, materialization, bootstrap) is human-machine local state.',
    '- Git = **transport + version history**. Everything travels as commits; the cloud pulls --ff-only.',
    '- GrokBot cloud = **read-mostly working copy**. Bots read profiles and the bootstrap package to operate; they do not casually modify canonical architecture.',
    '- Architecture change flow: proposal → owning specialist/chief → ProjectsChief → ChiefOfStaff → human/OpenCode applies the edit → commit → cloud `git pull --ff-only`. Bots never edit-and-push directly.',
    '',
    `If anything is ambiguous, escalate to the human. Do not guess.`,
  ].join('\n');
}

function a2aSmokeTestMd(w: Workforce): string {
  const tests = a2aSmokeTest(w);
  const specLines = A2A_SMOKE_SPEC.map(
    (s) =>
      `  TASK   ${s.taskLine}\n  RESULT RESULT|ChiefOfStaff→${s.responder}|${s.expectedFactsToCheck.join('; ')}|none|1|none`,
  );
  const registry = tests
    .map(
      (t) =>
        `  ${t.responder}: ${t.hierarchyFacts.join(' · ')} -> ${t.hierarchyMatches ? 'OK' : 'MISMATCH'}`,
    )
    .join('\n');
  return [
    '# A2A SMOKE TEST — minimum-cost proof the hierarchy agrees',
    '',
    'Send the TASK line to each responder; the responder must answer in ONE bounded line, no external action, with exactly the facts this registry already encodes:',
    '',
    registry,
    '',
    'Mission-spec form (human-readable):',
    ...specLines.flatMap((line) => line.split('\n')),
    '',
    'Native canonical form: confidence is a number 0..1 (`1`, not `high`) so the packet round-trips through the parser — verify with `pnpm grok a2a-smoke`.',
    '',
    SMOKE_ANSWER_ACCEPTANCE,
    '',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* profile creation card                                               */
/* ------------------------------------------------------------------ */

export function createCardFor(w: Workforce, id: string): CreateCard | null {
  const role = w.roles.get(id);
  if (!role) return null;
  const description = role.highlySensitive
    ? `${w.kernel}\nROLE: ${role.name} — ${role.mission}\nROUTING: emerging · ${role.approvalBoundary} · ${role.dataClass}\nSENSITIVE: no credentials · metadata over raw · recheck · irreversible → human`
    : `${w.kernel}\nROLE: ${role.name} — ${role.mission}\nROUTING: report → ${w.parent.get(id) ?? 'human'} · escalate irreversibles → human · boundary ${role.approvalBoundary} · data ${role.dataClass}`;
  const smoke = w.smokeTasks.overrides[role.name] ?? w.smokeTasks.default[role.tier] ?? '';
  return {
    name: role.name,
    title: role.title,
    description,
    smokeTest: smoke,
    nextMessage: NEXT_MESSAGE_CHIEF,
  };
}

/** Render the hub (ChiefOfStaff) creation card as a standalone markdown file. */
export function chiefOfStaffProfileMd(w: Workforce): string {
  const card = createCardFor(w, hubRoleId(w));
  if (!card) throw new Error('hub role not found');
  return [
    '# CHIEF OF STAFF — PROFILE (paste into a new GrokBot)',
    '',
    `NAME: ${card.name}`,
    `TITLE: ${card.title}`,
    '',
    'DESCRIPTION:',
    card.description,
    '',
    `SMOKE TEST: ${card.smokeTest}`,
    '',
    `NEXT MESSAGE: ${card.nextMessage}`,
    '',
  ].join('\n') + '\n';
}

/* ------------------------------------------------------------------ */
/* package writer + verifier                                           */
/* ------------------------------------------------------------------ */

export interface BootstrapBody {
  rel: string;
  content: string;
}

/** All content files (not including SHA256SUMS.txt) in deterministic order. */
export function bootstrapBodies(w: Workforce): BootstrapBody[] {
  const wave1names = usageReport(w).band.liveCore.map((id) => w.roles.get(id)?.name ?? id);
  return [
    { rel: 'roles.compact.json', content: rolesCompactJson(w) },
    { rel: 'hierarchy.compact.json', content: hierarchyCompactJson(w) },
    { rel: 'groups.compact.json', content: groupsCompactJson(w) },
    { rel: 'usage-policy.compact.json', content: usagePolicyCompactJson(w) },
    { rel: 'security.compact.md', content: securityCompactMd(w, wave1names.join(', ')) },
    { rel: 'A2A.compact.md', content: a2aCompactMd(w) },
    { rel: 'A2A_SMOKE_TEST.md', content: a2aSmokeTestMd(w) },
    { rel: 'ACTIVATE_NOW.md', content: activateNowMd(w, wave1names) },
    { rel: 'CHIEF_OF_STAFF_PROFILE.md', content: chiefOfStaffProfileMd(w) },
    { rel: 'LIVE_ROSTER.md', content: liveRosterMd(w) },
    { rel: 'README_FIRST.md', content: readmeFirstMd(w, wave1names) },
    { rel: 'SETUP_GROKBOT_COMPUTER.md', content: setupGrokbotComputerMd(w) },
    { rel: 'SPECIALIST_CREATION_POLICY.md', content: specialistPolicyMd(w) },
    { rel: 'WAVE2_QUEUE.md', content: wave2QueueMd(w) },
    { rel: 'GROKBOT_BOOTSTRAP_PROMPT.md', content: bootstrapPromptMd(w, wave1names) },
  ].sort((a, b) => a.rel.localeCompare(b.rel));
}

export function writeBootstrap(w: Workforce, outDir = bootstrapDir()): BootstrapPackage {
  mkdirSync(outDir, { recursive: true });
  const files: BootstrapFile[] = bootstrapBodies(w).map((b) => ({
    rel: b.rel,
    content: b.content,
    bytes: Buffer.byteLength(b.content, 'utf8'),
    sha256: sha(b.content),
  }));
  files.sort((a, b) => a.rel.localeCompare(b.rel));

  const sums = files.map((f) => `${f.sha256}  ${f.rel}`).join('\n') + '\n';
  const sumsFile: BootstrapFile = {
    rel: 'SHA256SUMS.txt',
    content: sums,
    bytes: Buffer.byteLength(sums, 'utf8'),
    sha256: sha(sums),
  };

  for (const f of files) writeFileSync(join(outDir, f.rel), f.content, 'utf8');
  writeFileSync(join(outDir, sumsFile.rel), sumsFile.content, 'utf8');

  const all = [...files, sumsFile];
  return {
    dir: outDir,
    files: all,
    totalBytes: all.reduce((n, f) => n + f.bytes, 0),
    checksumsVerified: verifyChecksums(outDir),
  };
}

export function verifyChecksums(dir = bootstrapDir()): boolean {
  try {
    const sums = readFileSync(join(dir, 'SHA256SUMS.txt'), 'utf8').split('\n').filter(Boolean);
    for (const line of sums) {
      const [digest, ...rest] = line.trim().split(/\s+/);
      const rel = rest.join(' ');
      if (!digest || !rel) return false;
      if (sha(readFileSync(join(dir, rel), 'utf8')) !== digest) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export const bootstrapPackageFiles = (): string[] => [
  'README_FIRST.md',
  'CHIEF_OF_STAFF_PROFILE.md',
  'GROKBOT_BOOTSTRAP_PROMPT.md',
  'roles.compact.json',
  'hierarchy.compact.json',
  'groups.compact.json',
  'usage-policy.compact.json',
  'security.compact.md',
  'A2A.compact.md',
  'A2A_SMOKE_TEST.md',
  'ACTIVATE_NOW.md',
  'LIVE_ROSTER.md',
  'SETUP_GROKBOT_COMPUTER.md',
  'SPECIALIST_CREATION_POLICY.md',
  'WAVE2_QUEUE.md',
  'SHA256SUMS.txt',
];