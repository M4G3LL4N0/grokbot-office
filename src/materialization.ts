// GrokBot Office — role materialization model.
// ROLE EXISTS (registry) is separate from LIVE CURSOR GROKBOT EXISTS (bot).
// Generating a profile NEVER creates a bot. Status only changes when a human
// reports it via `pnpm grok materialize:set`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { ROOT } from './paths.js';
import type { Workforce } from './registry.js';
import { firstSmokeTask } from './registry.js';
import { buildProfile } from './profiles.js';
import { canGoLive, roleState, currentBand } from './budget.js';
import { formatPath, escalationPath, isChief } from './hierarchy.js';

export const MATERIALIZATION_STATUSES = [
  'registry_only',
  'profile_generated',
  'live_unverified',
  'live_verified',
  'paused',
  'retired',
] as const;

export type MaterializationStatus = (typeof MATERIALIZATION_STATUSES)[number];

export const isMaterializationStatus = (v: unknown): v is MaterializationStatus =>
  MATERIALIZATION_STATUSES.includes(v as MaterializationStatus);

export type MaterializationState = Record<string, MaterializationStatus>;

export const statePath = (root = ROOT): string => join(root, 'state', 'materialization.json');

export function readMaterialization(root = ROOT): MaterializationState {
  const p = statePath(root);
  if (!existsSync(p)) return {};
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Record<string, MaterializationStatus>;
    for (const [k, v] of Object.entries(raw)) {
      if (!isMaterializationStatus(v)) delete raw[k];
    }
    return raw;
  } catch {
    return {};
  }
}

export function writeMaterializationStatus(root: string, roleId: string, status: MaterializationStatus): MaterializationState {
  if (!isMaterializationStatus(status)) throw new Error(`invalid materialization status: ${status}`);
  const state = readMaterialization(root);
  state[roleId] = status;
  const p = statePath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2) + '\n');
  return state;
}

export interface MaterializationPlan {
  id: string;
  name: string;
  currentStatus: MaterializationStatus;
  profileGenerated: boolean;
  liveEligible: boolean;
  liveEligibleWhy: string;
  creationChannel: 'manual' | 'bot-suggested' | 'unavailable';
  channelNote: string;
  adapterFlag: { enabled: boolean; verdict: string };
  steps: string[];
}

/**
 * Exact instructions to realize a role in Cursor GrokBot. Manual creation is
 * canonical and truthful: there is NO official public bot-creation API. The
 * adapter behind GROK_FEATURE_CREATE_ADAPTER stays disabled unless (a) an
 * official interface is independently verified AND (b) the human opts in.
 */
export function materializePlan(w: Workforce, id: string, root = ROOT): MaterializationPlan {
  const role = w.roles.get(id);
  if (!role) throw new Error(`unknown role: ${id}`);
  const st = roleState(w, id)!;
  const profile = buildProfile(w, id)!;
  const state = readMaterialization(root);
  const currentStatus = state[id] ?? 'registry_only';
  const gate = canGoLive(w, id);
  const { path } = escalationPath(w, id);
  const adapterEnabled = process.env.GROK_FEATURE_CREATE_ADAPTER === '1';

  const steps = [
    `1. Generate profile (already available): pnpm grok profile ${role.name}`,
    `2. Open Cursor GrokBot (desktop app)`,
    `3. Choose New (Cmd+N) → Create new agent`,
    `4. Bot actions → Edit Profile → set NAME=${role.name}, TITLE=${role.title}`,
    `5. Paste DESCRIPTION (kernel + mission + routing${role.highlySensitive ? ' + SENSITIVE clause' : ''})`,
    `6. Send FIRST_SMOKE_TASK: "${profile.firstSmokeTask}"`,
    `7. On success, mark live (human only): pnpm grok materialize:set ${id} live_verified`,
  ];

  return {
    id,
    name: role.name,
    currentStatus,
    profileGenerated: true,
    liveEligible: gate.ok,
    liveEligibleWhy: gate.ok ? `eligible (${formatPath(w, path)})` : gate.why,
    creationChannel: 'manual',
    channelNote:
      'No official public bot-creation API is assumed. An undocumented local gateway and third-party CLIs are not dependencies; manual creation remains canonical.',
    adapterFlag: {
      enabled: adapterEnabled,
      verdict: adapterEnabled
        ? 'flag on but no independently verified official interface → still manual'
        : 'GROK_FEATURE_CREATE_ADAPTER unset → adapter disabled; manual creation is canonical',
    },
    steps,
  };
}

export type ShouldCreateVerdict = 'create_dedicated_bot' | 'use_existing_chief' | 'defer' | 'exists';

/**
 * Usage-aware action code (mission Part B item 5). The verdict says WHY the
 * capability should stay virtual; the code says WHAT the operator should do.
 * At 79% (CONSERVE) exactly three roles are CREATE_NOW (the wave-1 core);
 * everything else is DEFER_UNTIL_RESET (would re-enter a looser band) or
 * USE_TEMPORARY_ROLE (run through the existing chief). The other two codes
 * describe situations outside the CONSERVE example: the budget governor hard-
 * blocks creation, or the human must sign off first.
 */
export type ShouldCreateCode =
  | 'CREATE_NOW'
  | 'USE_TEMPORARY_ROLE'
  | 'DEFER_UNTIL_RESET'
  | 'BLOCKED_BY_USAGE'
  | 'NEEDS_HUMAN_APPROVAL';

export const SHOULD_CREATE_CODE_DESC: Record<ShouldCreateCode, string> = {
  CREATE_NOW: 'eligible and budgeted: safe to create a dedicated Bot now (wave-1 core only)',
  USE_TEMPORARY_ROLE: 'not yet worth/still cost-constrained: run the capability through the existing chief as a temporary role first',
  DEFER_UNTIL_RESET: 'would re-enter the live core in a looser band: re-evaluate after the weekly usage reset',
  BLOCKED_BY_USAGE: 'usage governor hard-blocks creation in this band: do not create, re-evaluate only when the band changes',
  NEEDS_HUMAN_APPROVAL: 'eligible but requires human sign-off first (sensitive/privileged, or awaiting live verification)',
};

export interface ShouldCreateDecision {
  id: string;
  name: string;
  band: string;
  existingStatus: MaterializationStatus;
  eligibleNow: boolean;
  eligibleWhy: string;
  verdict: ShouldCreateVerdict;
  /** NEW (Part B): usage-aware action code — CREATE_NOW / USE_TEMPORARY_ROLE / DEFER_UNTIL_RESET / BLOCKED_BY_USAGE / NEEDS_HUMAN_APPROVAL */
  code: ShouldCreateCode;
  codeDescription: string;
  reasonsFor: string[];
  reasonsAgainst: string[];
  temporaryCarrier: string;
  pathway: string[];
}

/**
 * decision aid: should this capability become a dedicated, durable GrokBot?
 * Deliberately biased against creating new bots. A capability only earns its
 * own long-lived agent when there is a standing hub/recurring-work signal AND
 * the budget band allows it; otherwise it is run through the existing chief as
 * a TEMPORARY role. This mirrors official docs: an existing Bot may suggest or
 * create a focused Bot for a job with a long-lived owner — but only the human
 * confirms it, and nothing here activates anything.
 */
export function shouldCreateDecision(w: Workforce, id: string, root = ROOT): ShouldCreateDecision {
  const role = w.roles.get(id);
  if (!role) throw new Error(`unknown role: ${id}`);

  const band = currentBand(w);
  const st = roleState(w, id)!;
  const gate = canGoLive(w, id);
  const status = readMaterialization(root);
  const existingStatus = status[id] ?? 'registry_only';
  const { path } = escalationPath(w, id);

  const reasonsFor: string[] = [];
  const reasonsAgainst: string[] = [];

  if (isChief(w, id)) reasonsFor.push('standing coordination hub (chief) — recurring long-lived owner is inherent');
  if (w.routineTemplates.some((t) => t.memberIds.includes(id)))
    reasonsFor.push('referenced by a routine template → recurring workflow in config');
  if (w.groups.explicit_groups && Object.values(w.groups.explicit_groups).some((g) => g.members.includes(role.name)))
    reasonsFor.push('member of an explicit collaboration group → work spans multiple sessions');
  if (role.activation === 'core' || role.activation === 'warm')
    reasonsFor.push(`standing work per design intent (activation ${role.activation})`);

  const principals: Array<[string, string]> = [
    ['standing coordination hub (chief)', 'recurring workflow in config'],
  ];
  const hasRecurringDefinite = principals.some(([k]) =>
    reasonsFor.some((r) => r.startsWith(k)),
  );

  reasonsAgainst.push('A2A law: 134 roles defined as data — run the capability through the existing chief as a temporary role first');
  if (role.dataClass === 'highly_sensitive')
    reasonsAgainst.push('highly-sensitive data — durable bot memory is a wider exposure than a scoped temporary role');
  if (role.approvalBoundary !== 'information')
    reasonsFor.push(`calls for its own approval boundary (${role.approvalBoundary}) — dedicated bot fits a distinct boundary`);
  if (role.budgetClass === 'small' || role.budgetClass === 'medium')
    reasonsFor.push('multi-step work benefits from durable cross-session memory');
  if (role.priority === 'core' || role.priority === 'high')
    reasonsFor.push(`high-value priority (${role.priority}) — may justify persistence if it earns it`);
  if (role.activation === 'experimental')
    reasonsAgainst.push('experimental capability — keep it virtual until it proves value');
  if (role.activation === 'ondemand' && role.priority === 'advanced')
    reasonsAgainst.push('advanced on-demand capability — create only when a real request recurs');

  if (!gate.ok) reasonsAgainst.push(`cannot go live now in ${band.label}: ${gate.why}`);
  if ((band.key === 'conserve' || band.key === 'critical') && !band.liveCore.includes(id))
    reasonsAgainst.push(`USAGE ${band.label} — no new persistent bots beyond live core (allow_new_live=${w.policy.conservation.allow_new_live})`);

  const carryId = path[1];
  const carrier = carryId && w.roles.has(carryId) ? `${carryId} ${w.roles.get(carryId)!.name}` : `${path[0] ?? '01'} ChiefOfStaff`;

  let verdict: ShouldCreateVerdict;
  if (existingStatus === 'live_verified') verdict = 'exists';
  else if (!gate.ok) verdict = 'defer';
  else if (hasRecurringDefinite && reasonsFor.length >= reasonsAgainst.length) verdict = 'create_dedicated_bot';
  else verdict = 'use_existing_chief';

  let pathway: string[];
  if (verdict === 'exists') {
    pathway = [`${role.name} is already live_verified — keep it, do not duplicate.`];
  } else if (verdict === 'defer') {
    pathway = [
      `Not now. Gate: ${gate.why}`,
      `Watch the usage band (pnpm grok mode). After the weekly reset and when band allows, re-run: pnpm grok should-create ${role.name}`,
      `Meanwhile, if the capability is genuinely needed today: run it through ${carrier} as a temporary role (see use_existing_chief pathway).`,
    ];
  } else if (verdict === 'create_dedicated_bot') {
    pathway = [
      `Card: pnpm grok profile ${role.name}`,
      'New (Cmd+N) → Create new agent → Bot actions → Edit Profile → paste the card',
      `Send FIRST_SMOKE_TASK: "${firstSmokeTask(w, role)}"`,
      `On real success only: pnpm grok materialize:set ${id} live_verified`,
      'Native note (VERIFIED docs): an existing GrokBot may suggest or create a focused Bot for a long-lived job — creation still ends with human confirmation in the UI.',
    ];
  } else {
    pathway = [
      `Run it through ${carrier} as a TEMPORARY role for this task only, e.g.: "ACT AS ${role.name} for this task only. Scope, do, report, stop."`,
      'Re-run this decision when the same temporary work recurs ~3× across weeks OR usage drops a band: pnpm grok should-create <role>',
      'A generated profile card is always available (pnpm grok profile) without creating anything.',
    ];
  }

  // Usage-aware action code (Part B item 5). Decision tree, top-down. It can
  // be verified against the mission's example: at 79% (CONSERVE) only the wave-1
  // core (ChiefOfStaff/IntelligenceChief/ProjectsChief) is CREATE_NOW; the core
  // chiefs that return in a looser band are DEFER_UNTIL_RESET; everything else
  // is USE_TEMPORARY_ROLE. BLOCKED_BY_USAGE fires only when the governor hard-
  // blocks (CRITICAL: preserve usage for urgent work), and NEEDS_HUMAN_APPROVAL
  // when a human must sign off or verify first.
  const inCore = band.liveCore.includes(id);
  const recurringChief = role.priority === 'core' && (isChief(w, id) || role.tier === 'command');

  let code: ShouldCreateCode;
  if (existingStatus === 'live_verified') {
    code = 'CREATE_NOW';
  } else if (inCore && gate.ok) {
    code = 'CREATE_NOW';
  } else if (existingStatus === 'live_unverified') {
    code = 'NEEDS_HUMAN_APPROVAL';
  } else if (band.key === 'critical' && !inCore) {
    code = 'BLOCKED_BY_USAGE';
  } else if (recurringChief && !inCore) {
    code = 'DEFER_UNTIL_RESET';
  } else {
    code = 'USE_TEMPORARY_ROLE';
  }

  return {
    id: role.id,
    name: role.name,
    band: band.label,
    existingStatus,
    eligibleNow: gate.ok,
    eligibleWhy: gate.ok ? 'eligible for live in current band' : gate.why,
    verdict,
    code,
    codeDescription: SHOULD_CREATE_CODE_DESC[code],
    reasonsFor,
    reasonsAgainst,
    temporaryCarrier: carrier,
    pathway,
  };
}