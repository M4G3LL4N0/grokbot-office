// GrokBot Office — rollout plan.
// Phased materialization of the 134-role registry, gated by the current
// usage band. Always MANUAL STEP: a human pastes a profile into Cursor GrokBot.

import type { Workforce } from './registry.js';
import type { UsageBand } from './usage.js';
import { currentBand, usageReport } from './budget.js';

export interface RolloutPhase {
  phase: number;
  name: string;
  band: UsageBand['key'][];
  roleIds: string[];
  condition: string;
  now: boolean;
}

const idsOf = (w: Workforce, names: string[]): string[] => {
  const out: string[] = [];
  for (const n of names) {
    const r = [...w.roles.values()].find((x) => x.name === n);
    if (r) out.push(r.id);
  }
  return out;
};

export function rolloutPlan(w: Workforce): RolloutPhase[] {
  const band = currentBand(w);
  const core = w.policy.normal.core_persistent ?? [];
  const highVal = w.policy.normal.high_value_ondemand ?? [];
  const onDemandIds = [...w.roles.keys()].filter(
    (id) => !core.includes(id) && w.roles.get(id)?.activation === 'ondemand',
  );

  const phases: RolloutPhase[] = [
    {
      phase: 1,
      name: 'Core triad',
      band: ['conserve'],
      roleIds: idsOf(w, ['ChiefOfStaff', 'IntelligenceChief', 'ProjectsChief']),
      condition: 'CONSERVE/CONSERVE_LIGHT: only 01-03 eligible now',
      now: band.key === 'conserve',
    },
    {
      phase: 2,
      name: 'Command chiefs',
      band: ['conserve_light', 'normal', 'explore'],
      roleIds: idsOf(w, [
        'ChiefOfStaff', 'IntelligenceChief', 'ProjectsChief', 'PersonalOfficeChief',
        'FamilyOfficeChief', 'ResearchChief', 'AutomationChief', 'RealityAuditor',
        'KnowledgeChief', 'CostOptimizer', 'PrivateChiefOfStaff', 'SyntheticAdvisoryBoard',
      ]),
      condition: 'CONSERVE_LIGHT (<=5 chiefs) → NORMAL (<=10) — 12-count chiefs set each gets a dedicated profile',
      now: band.key === 'conserve_light',
    },
    {
      phase: 3,
      name: 'High-value on-demand',
      band: ['normal', 'explore'],
      roleIds: highVal,
      condition: 'NORMAL/EXPLORE: on-demand specialists (sections 11-30) respond per user request',
      now: band.key === 'normal' || band.key === 'explore',
    },
    {
      phase: 4,
      name: 'Advanced & experimental',
      band: ['explore'],
      roleIds: onDemandIds,
      condition: 'EXPLORE: advanced/experimental only on explicit human request',
      now: band.key === 'explore',
    },
  ];

  return phases;
}

export function rolloutReport(w: Workforce): { band: UsageBand; phases: RolloutPhase[] } {
  return { band: currentBand(w), phases: rolloutPlan(w) };
}

export function allowedNow(w: Workforce): {
  liveNow: string[];
  allowedOnDemand: string[];
  whyBlocked: Array<{ id: string; reason: string }>;
} {
  const band = currentBand(w);
  const rep = usageReport(w);
  const liveNow = rep.eligibleLiveNow.map((s) => s.role.id);
  const allowedOnDemand =
    band.key === 'explore' || band.key === 'normal'
      ? [...w.roles.keys()].filter((id) => w.roles.get(id)?.activation === 'ondemand')
      : [];
  const whyBlocked: Array<{ id: string; reason: string }> = [];
  for (const id of w.roles.keys()) {
    if (liveNow.includes(id) || allowedOnDemand.includes(id)) continue;
    const r = w.roles.get(id)!;
    let reason: string;
    if (r.activation === 'experimental') reason = `experimental (${band.label}: blocked)`;
    else if (band.key === 'conserve') reason = 'CONSERVE: eligible core is 01-03 only';
    else if (band.key === 'critical') reason = 'CRITICAL: ChiefOfStaff + one necessary specialist only';
    else if (band.key === 'conserve_light') reason = 'CONSERVE_LIGHT: <=5 chiefs active; specialists on request';
    else reason = 'dormant';
    whyBlocked.push({ id, reason });
  }
  return { liveNow, allowedOnDemand, whyBlocked };
}