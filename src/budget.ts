// GrokBot Office — usage conservation and per-role token budgets.
// The effective mode is the USAGE GOVERNOR band (EXPLORE/NORMAL/
// CONSERVE_LIGHT/CONSERVE/CRITICAL) computed from the persisted used %.
// At 79% used → CONSERVE: only ChiefOfStaff, IntelligenceChief, ProjectsChief
// are eligible to be live; everything else stays configured/dormant.
// Nothing here activates anything.

import type { LiveState, RoleDefinition } from '../registry/schema.js';
import type { Workforce } from './registry.js';
import { readUsageState, modeFor, type UsageBand } from './usage.js';
import { join } from 'node:path';
import { ROOT } from './paths.js';

export interface RoleState {
  role: RoleDefinition;
  state: LiveState;
  canCreate: boolean;
  tokenPerTask: number;
}

export function currentBand(w: Workforce): UsageBand {
  const state = readUsageState(ROOT, w.policy.used_pct);
  return modeFor(state.usedPercent);
}

export const liveNowIds = (w: Workforce): string[] => {
  const band = currentBand(w);
  return [...band.liveCore];
};

/** Effective live state under the active usage band. */
export function roleState(w: Workforce, roleId: string): RoleState | null {
  const role = w.roles.get(roleId);
  if (!role) return null;

  const band = currentBand(w);
  const state = readUsageState(ROOT, w.policy.used_pct);

  let live: LiveState;
  if (role.activation === 'experimental') {
    live = band.experimentalBlocked ? 'dormant' : 'experimental';
  } else if (band.liveCore.includes(roleId)) {
    live = 'eligible-live-now';
  } else if ((band.key === 'explore' || band.key === 'normal') && role.activation === 'ondemand') {
    live = 'on-demand';
  } else {
    live = 'dormant';
  }

  const canCreate =
    live === 'eligible-live-now' &&
    !(band.key === 'conserve' && w.policy.conservation.allow_new_live === false) &&
    band.key !== 'critical';

  const tokenPerTask = w.policy.token_budget_per_task[role.budgetClass] ?? 5000;
  return { role, state: live, canCreate, tokenPerTask };
}

export function allStates(w: Workforce): RoleState[] {
  return [...w.roles.keys()].map((id) => roleState(w, id)!);
}

export interface UsageReport {
  usedPct: number;
  remainingPct: number;
  mode: string;
  band: UsageBand;
  onDemandEnabled: boolean;
  resetDate: string | null;
  lastUpdated: string;
  harvest: { available: boolean; why: string };
  totalRoles: number;
  eligibleLiveNow: RoleState[];
  dormantCount: number;
  onDemandCount: number;
  experimentalCount: number;
  warmCount: number;
  maxLiveRoles: number;
  maxSpecialistsPerRequest: number;
  headroom: number;
  recoveryTrigger: string;
}

export function usageReport(w: Workforce): UsageReport {
  const states = allStates(w);
  const by = (s: LiveState) => states.filter((x) => x.state === s);
  const eligible = by('eligible-live-now');
  const rec = w.policy.conservation?.recovery_trigger;
  const us = readUsageState(ROOT, w.policy.used_pct);
  const band = modeFor(us.usedPercent);

  return {
    usedPct: us.usedPercent,
    remainingPct: us.remainingPercent,
    mode: band.label,
    band,
    onDemandEnabled: us.onDemandEnabled,
    resetDate: us.resetDate,
    lastUpdated: us.lastUpdated,
    harvest: harvestState(w),
    totalRoles: w.roles.size,
    eligibleLiveNow: eligible,
    dormantCount: by('dormant').length,
    onDemandCount: by('on-demand').length,
    experimentalCount: by('experimental').length,
    warmCount: by('warm').length,
    maxLiveRoles: w.policy.conservation?.max_live_roles ?? band.liveCore.length,
    maxSpecialistsPerRequest: band.maxSpecialistsPerRequest,
    headroom: 100 - us.usedPercent,
    recoveryTrigger: rec ? `used < ${rec.used_under_pct}% sustained ${rec.sustained_days}d` : 'n/a',
  };
}

export function harvestState(w: Workforce): { available: boolean; why: string } {
  const us = readUsageState(ROOT, w.policy.used_pct);
  if (!us.endOfCycleHarvest.enabled) return { available: false, why: 'end-of-cycle harvest not enabled by human' };
  if (!us.resetDate) return { available: false, why: 'no reset date known' };
  const days = Math.ceil((new Date(us.resetDate).getTime() - Date.now()) / 86_400_000);
  if (Number.isNaN(days) || days > 5) return { available: false, why: 'reset not near' };
  if (us.remainingPercent < 5) return { available: false, why: 'no meaningful unused allowance' };
  return { available: true, why: `harvest window: ${days}d to reset, ${us.remainingPercent}% unused` };
}

/** Conservation gate: may we bring a role live right now? */
export function canGoLive(w: Workforce, roleId: string): { ok: boolean; why: string } {
  const st = roleState(w, roleId);
  if (!st) return { ok: false, why: 'unknown role' };
  if (st.state !== 'eligible-live-now')
    return { ok: false, why: `role is ${st.state}; only eligible-live-now roles may go live in ${usageReport(w).mode} mode` };
  const band = currentBand(w);
  if (band.key === 'conserve' && !w.policy.conservation.allow_new_live) {
    const contained = band.liveCore.includes(roleId);
    return { ok: contained, why: contained ? 'in conservation allowlist' : 'outside conservation allowlist' };
  }
  if (band.key === 'critical') return { ok: false, why: 'critical mode: ChiefOfStaff + one necessary specialist only' };
  return { ok: true, why: 'policy permits' };
}