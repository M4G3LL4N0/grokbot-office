// GrokBot Office — usage governor.
// Single source of truth for Cursor GrokBot usage: persisted locally in
// state/usage.json (gitignored). NEVER scrapes credentials, NEVER fabricates
// meter data, NEVER auto-toggles on-demand billing.
//
// Bands derive from the USED percentage, exactly as specified:
//   0-24  EXPLORE       25-49 NORMAL        50-74 CONSERVE_LIGHT
//   75-89 CONSERVE      90-100 CRITICAL

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './paths.js';

export type UsageBandKey =
  | 'explore'
  | 'normal'
  | 'conserve_light'
  | 'conserve'
  | 'critical';

export type GroupAllowance = 'never' | 'limited' | 'justified' | 'yes';

export interface UsageBand {
  key: UsageBandKey;
  label: string;
  minUsedPct: number;
  maxUsedPct: number;
  liveCore: readonly string[];
  /** max specialist roles a single user request may hand off to */
  maxSpecialistsPerRequest: number;
  groupsAllowed: GroupAllowance;
  routines: 'off' | 'candidate';
  experimentalBlocked: boolean;
  proactiveResearch: boolean;
  notes: string;
}

export const BAND_LIVE_CORE = {
  // command chiefs 01-10 (normal/explore)
  full_core: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'],
  // <=5 chiefs active (50-74)
  light_core: ['01', '02', '03', '04', '05'],
  // conserve (75-89): ChiefOfStaff, IntelligenceChief, ProjectsChief
  conserve_core: ['01', '02', '03'],
  // critical (90-100): ChiefOfStaff + one necessary specialist only
  critical_core: ['01'],
} as const;

const USAGE_BANDS_UNSORTED: UsageBand[] = [
  {
    key: 'critical',
    label: 'CRITICAL',
    minUsedPct: 90,
    maxUsedPct: 100,
    liveCore: BAND_LIVE_CORE.critical_core,
    maxSpecialistsPerRequest: 1,
    groupsAllowed: 'never',
    routines: 'off',
    experimentalBlocked: true,
    proactiveResearch: false,
    notes: 'ChiefOfStaff + one necessary specialist only; no proactive research; preserve usage for urgent work',
  },
  {
    key: 'conserve',
    label: 'CONSERVE',
    minUsedPct: 75,
    maxUsedPct: 89,
    liveCore: BAND_LIVE_CORE.conserve_core,
    maxSpecialistsPerRequest: 1,
    groupsAllowed: 'never',
    routines: 'off',
    experimentalBlocked: true,
    proactiveResearch: false,
    notes: 'eligible core: ChiefOfStaff/IntelligenceChief/ProjectsChief; <=1 specialist handoff; no routines; no group-wide research; no RandomWalker/Serendipity/UnknownUnknown background; no simulated societies; no tournaments/evolution; human-initiated work only',
  },
  {
    key: 'conserve_light',
    label: 'CONSERVE_LIGHT',
    minUsedPct: 50,
    maxUsedPct: 74,
    liveCore: BAND_LIVE_CORE.light_core,
    maxSpecialistsPerRequest: 2,
    groupsAllowed: 'limited',
    routines: 'off',
    experimentalBlocked: true,
    proactiveResearch: false,
    notes: '<=5 chiefs active; <=2 specialists per request; expensive research needs explicit need; experimental agents disabled',
  },
  {
    key: 'normal',
    label: 'NORMAL',
    minUsedPct: 25,
    maxUsedPct: 49,
    liveCore: BAND_LIVE_CORE.full_core,
    maxSpecialistsPerRequest: 3,
    groupsAllowed: 'limited',
    routines: 'candidate',
    experimentalBlocked: false,
    proactiveResearch: true,
    notes: 'core chiefs; <=3 specialists per user request; limited groups; no speculative expensive swarms',
  },
  {
    key: 'explore',
    label: 'EXPLORE',
    minUsedPct: 0,
    maxUsedPct: 24,
    liveCore: BAND_LIVE_CORE.full_core,
    maxSpecialistsPerRequest: 4,
    groupsAllowed: 'yes',
    routines: 'candidate',
    experimentalBlocked: false,
    proactiveResearch: true,
    notes: 'all core chiefs allowed; up to 4 relevant specialists; group work allowed when justified; experimental roles permitted manually; candidate routines may be tested',
  },
];

export const USAGE_BANDS: UsageBand[] = [...USAGE_BANDS_UNSORTED].sort((a, b) => b.minUsedPct - a.minUsedPct);

export function modeFor(usedPct: number): UsageBand {
  for (const b of USAGE_BANDS) {
    if (usedPct >= b.minUsedPct && usedPct <= b.maxUsedPct) return b;
  }
  return USAGE_BANDS[1]!; // normal fallback (25-49)
}

export interface HarvestConfig {
  enabled: boolean;
}

export interface UsageState {
  usedPercent: number;
  remainingPercent: number;
  resetDate: string | null;
  onDemandEnabled: boolean;
  endOfCycleHarvest: HarvestConfig;
  lastUpdated: string;
}

const DEFAULTS: UsageState = {
  usedPercent: 79,
  remainingPercent: 21,
  resetDate: null,
  onDemandEnabled: false,
  endOfCycleHarvest: { enabled: false },
  lastUpdated: '-',
};

export const statePath = (root: string): string => join(root, 'state', 'usage.json');

export function readUsageState(root = ROOT, usedPctFallback = 79): UsageState {
  const p = statePath(root);
  if (existsSync(p)) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<UsageState>;
      return {
        usedPercent: typeof raw.usedPercent === 'number' ? raw.usedPercent : usedPctFallback,
        remainingPercent:
          typeof raw.remainingPercent === 'number' ? raw.remainingPercent : 100 - usedPctFallback,
        resetDate: raw.resetDate ?? null,
        onDemandEnabled: raw.onDemandEnabled ?? false,
        endOfCycleHarvest: raw.endOfCycleHarvest ?? { enabled: false },
        lastUpdated: raw.lastUpdated ?? '-',
      };
    } catch {
      // corrupt state file → fall through to defaults (never fabricate)
    }
  }
  return { ...DEFAULTS, usedPercent: usedPctFallback, remainingPercent: 100 - usedPctFallback };
}

function persist(root: string, state: UsageState): UsageState {
  const p = statePath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2) + '\n');
  return state;
}

/** Set the used percentage; remaining recomputed (=100-used). Human-only action. */
export function setUsageUsedPct(root: string, usedPct: number): UsageState {
  const clamped = Math.max(0, Math.min(100, usedPct));
  const state = readUsageState(root);
  state.usedPercent = clamped;
  state.remainingPercent = 100 - clamped;
  state.lastUpdated = new Date().toISOString();
  return persist(root, state);
}

/** Set optional reset date (YYYY-MM-DD). */
export function setResetDate(root: string, isoDate: string | null): UsageState {
  const state = readUsageState(root);
  state.resetDate = isoDate;
  state.lastUpdated = new Date().toISOString();
  return persist(root, state);
}

/** Enable/disable on-demand billing. NEVER called automatically. */
export function setOnDemandEnabled(root: string, enabled: boolean): UsageState {
  const state = readUsageState(root);
  state.onDemandEnabled = enabled;
  state.lastUpdated = new Date().toISOString();
  return persist(root, state);
}

/** Enable/disable END-OF-CYCLE HARVEST. NEVER enabled automatically. */
export function setHarvestEnabled(root: string, enabled: boolean): UsageState {
  const state = readUsageState(root);
  state.endOfCycleHarvest.enabled = enabled;
  state.lastUpdated = new Date().toISOString();
  return persist(root, state);
}

/** Days until the (known) reset date, or null. */
export function daysUntilReset(state: UsageState): number | null {
  if (!state.resetDate) return null;
  const then = new Date(state.resetDate).getTime();
  if (Number.isNaN(then)) return null;
  return Math.ceil((then - Date.now()) / 86_400_000);
}

/**
 * Harvest is available only when: human enabled it AND a reset date is known
 * AND it is near AND meaningful unused included allowance exists. It
 * queues valuable research before the reset; it NEVER burns tokens just to
 * use them.
 */
export function harvestAvailable(state: UsageState): { available: boolean; why: string } {
  if (!state.endOfCycleHarvest.enabled)
    return { available: false, why: 'end-of-cycle harvest not enabled by human' };
  if (!state.resetDate)
    return { available: false, why: 'no reset date known' };
  const days = daysUntilReset(state);
  if (days === null || days > 5)
    return { available: false, why: 'reset not near' };
  if (state.remainingPercent < 5)
    return { available: false, why: 'no meaningful unused allowance' };
  return {
    available: true,
    why: `harvest window: ${days}d to reset, ${state.remainingPercent}% unused`,
  };
}

export function usageStateReport(state: UsageState): {
  band: UsageBand;
  harvest: { available: boolean; why: string };
} {
  return { band: modeFor(state.usedPercent), harvest: harvestAvailable(state) };
}