// GrokBot Office — usage telemetry.
// Append-only human-declared event log (state/usage-events.jsonl). Records what
// a GrokBot task was, whether its result was useful, how many handoffs it took,
// and the usage meter before/after. We NEVER scrape Cursor's meter and NEVER
// fabricate token numbers; percentages are whatever a human recorded, so the
// telemetry stays an honest pair of eyes, not a fake dashboard.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { ROOT } from './paths.js';
import type { Workforce } from './registry.js';

export interface UsageEvent {
  timestamp: string;
  usedPercentBefore?: number | null;
  usedPercentAfter?: number | null;
  role: string;
  taskClass: string;
  handoffs: number;
  resultUseful: boolean;
  resultConsumedBy: string;
  notes: string;
}

export const eventsPath = (root = ROOT): string => join(root, 'state', 'usage-events.jsonl');

const validateEvent = (e: UsageEvent): void => {
  if (!e.role || typeof e.role !== 'string') throw new Error('usage:log: role is required');
  if (typeof e.resultUseful !== 'boolean') throw new Error('usage:log: resultUseful must be boolean');
  if (!Number.isInteger(e.handoffs) || e.handoffs < 0)
    throw new Error(`usage:log: handoffs must be a non-negative integer (got ${e.handoffs})`);
  for (const key of ['usedPercentBefore', 'usedPercentAfter'] as const) {
    const v = e[key];
    if (v !== undefined && v !== null && (typeof v !== 'number' || v < 0 || v > 100))
      throw new Error(`usage:log: ${key} must be 0-100 (got ${String(v)})`);
  }
  for (const key of ['taskClass', 'resultConsumedBy', 'notes', 'timestamp'] as const) {
    if (typeof e[key] !== 'string') throw new Error(`usage:log: ${key} must be a string`);
  }
};

/** Append one validated event. Returns the persisted record. */
export function appendUsageEvent(root: string, event: UsageEvent): UsageEvent {
  const record: UsageEvent = {
    timestamp: event.timestamp,
    usedPercentBefore: event.usedPercentBefore ?? null,
    usedPercentAfter: event.usedPercentAfter ?? null,
    role: event.role.trim(),
    taskClass: event.taskClass.trim(),
    handoffs: event.handoffs,
    resultUseful: event.resultUseful,
    resultConsumedBy: event.resultConsumedBy.trim(),
    notes: event.notes.trim(),
  };
  validateEvent(record);
  const p = eventsPath(root);
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(record) + '\n', 'utf8');
  return record;
}

/** Read all events. Corrupt lines are skipped and counted (never guessed). */
export function readUsageEvents(root: string): { events: UsageEvent[]; skipped: number } {
  const p = eventsPath(root);
  if (!existsSync(p)) return { events: [], skipped: 0 };
  const events: UsageEvent[] = [];
  let skipped = 0;
  for (const [i, line] of readFileSync(p, 'utf8').split('\n').entries()) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line) as Partial<UsageEvent>;
      if (!raw.role) throw new Error('missing role');
      const e: UsageEvent = {
        timestamp: raw.timestamp ?? new Date().toISOString(),
        usedPercentBefore: raw.usedPercentBefore ?? null,
        usedPercentAfter: raw.usedPercentAfter ?? null,
        role: String(raw.role),
        taskClass: String(raw.taskClass ?? 'task'),
        handoffs: Number(raw.handoffs ?? 0),
        resultUseful: Boolean(raw.resultUseful),
        resultConsumedBy: String(raw.resultConsumedBy ?? ''),
        notes: String(raw.notes ?? ''),
      };
      validateEvent(e);
      events.push(e);
    } catch {
      skipped++;
    }
  }
  return { events, skipped };
}

export interface UsageEventsSummary {
  total: number;
  skipped: number;
  byRole: Array<{ role: string; events: number; useful: number; usefulRatio: number; totalHandoffs: number; lastUsed: string | null }>;
  mostUsefulRoles: Array<{ role: string; useful: number }>;
  leastUsedRoles: Array<{ role: string; events: number }>;
  neverUsed: string[];
  highCostLowValue: Array<{ role: string; taskClass: string; handoffs: number; useful: boolean; consumed: string; timestamp: string }>;
  keepWarm: string[];
  virtualCandidates: string[];
}

/**
 * Honest summary. Uses ONLY recorded events; roles with zero events are listed
 * as never-used, and are candidates to stay virtual/on-demand rather than
 * persistent bots.
 */
export function summarizeUsageEvents(events: UsageEvent[], w: Workforce, skipped = 0): UsageEventsSummary {
  const perRole = new Map<string, { n: number; useful: number; handoffs: number; last: string | null }>();
  for (const e of events) {
    const cur = perRole.get(e.role) ?? { n: 0, useful: 0, handoffs: 0, last: null };
    cur.n += 1;
    if (e.resultUseful) cur.useful += 1;
    cur.handoffs += e.handoffs;
    if (e.timestamp && (cur.last === null || e.timestamp > cur.last)) cur.last = e.timestamp;
    perRole.set(e.role, cur);
  }

  const byRole = [...perRole.entries()]
    .map(([role, v]) => ({
      role,
      events: v.n,
      useful: v.useful,
      usefulRatio: v.n > 0 ? v.useful / v.n : 0,
      totalHandoffs: v.handoffs,
      lastUsed: v.last,
    }))
    .sort((a, b) => a.role.localeCompare(b.role));

  const mostUsefulRoles = byRole
    .filter((r) => r.useful > 0)
    .sort((a, b) => b.useful - a.useful)
    .slice(0, 5)
    .map((r) => ({ role: r.role, useful: r.useful }));

  const leastUsedRoles = [...byRole]
    .sort((a, b) => a.events - b.events)
    .slice(0, 5)
    .map((r) => ({ role: r.role, events: r.events }));

  const roleIdsByName = new Map([...w.roles.values()].map((r) => [r.name, r.id]));
  const neverUsed = [...w.roles.values()].filter((r) => !perRole.has(r.name)).map((r) => r.name);

  // High-cost/low-value: several handoffs AND not useful — a pattern, not a verdict.
  const highCostLowValue = events
    .filter((e) => !e.resultUseful && e.handoffs >= 2)
    .map((e) => ({
      role: e.role,
      taskClass: e.taskClass,
      handoffs: e.handoffs,
      useful: e.resultUseful,
      consumed: e.resultConsumedBy,
      timestamp: e.timestamp,
    }));

  const keepWarm = byRole.filter((r) => r.useful > 0 && r.events >= 2).map((r) => r.role).slice(0, 5);
  const virtualCandidates = neverUsed
    .filter((name) => {
      const id = roleIdsByName.get(name);
      if (!id) return true;
      return w.roles.get(id)?.activation !== 'core';
    })
    .slice(0, 10);

  return {
    total: events.length,
    skipped,
    byRole,
    mostUsefulRoles,
    leastUsedRoles,
    neverUsed,
    highCostLowValue,
    keepWarm,
    virtualCandidates,
  };
}