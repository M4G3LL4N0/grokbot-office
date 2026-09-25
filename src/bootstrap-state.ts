// GrokBot Office — bootstrap state machine (Part 4).
// Tracks how far the local registry has been bridged to the real GrokBot
// environment. Monotonic forward movement only; anything beyond `package_ready`
// requires an explicit human confirmation flag. Nothing here contacts GrokBot.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { ROOT } from './paths.js';

export const BOOTSTRAP_STATUSES = [
  'unbridged',
  'package_ready',
  'repo_available_to_grokbot',
  'chief_created',
  'chief_verified',
  'wave1_created',
  'wave1_verified',
] as const;

export type BootstrapStatus = (typeof BOOTSTRAP_STATUSES)[number];

export const isBootstrapStatus = (s: string): s is BootstrapStatus =>
  (BOOTSTRAP_STATUSES as readonly string[]).includes(s);

export const statusIndex = (s: BootstrapStatus): number => BOOTSTRAP_STATUSES.indexOf(s);

export interface BootstrapStateRecord {
  status: BootstrapStatus;
  updatedAt: string;
  /** short human note about how this state was reached (optional) */
  note?: string;
}

export const bootstrapStatePath = (root = ROOT): string => join(root, 'state', 'bootstrap-state.json');

const DEFAULT_STATE: BootstrapStateRecord = { status: 'unbridged', updatedAt: '-' };

export function readBootstrapState(root = ROOT): BootstrapStateRecord {
  const p = bootstrapStatePath(root);
  if (existsSync(p)) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<BootstrapStateRecord>;
      const status = raw.status && isBootstrapStatus(raw.status) ? raw.status : 'unbridged';
      return { status, updatedAt: raw.updatedAt ?? '-', note: raw.note };
    } catch {
      // corrupt → treat as unbridged (never guess forward progress)
    }
  }
  return { ...DEFAULT_STATE };
}

export interface SetResult {
  record: BootstrapStateRecord;
  ok: boolean;
  why: string;
}

/**
 * Set the bootstrap state.
 * - Monotonic: may only move forward through BOOTSTRAP_STATUSES (equal = idempotent).
 * - Anything beyond `package_ready` requires `confirm: true` (explicit human action).
 * - `autoPackageReady` is only used by the `bootstrap` command itself (generating the
 *   package IS the event that makes it ready); it never advances past package_ready.
 */
export function setBootstrapStatus(
  root: string,
  next: BootstrapStatus,
  opts: { confirm?: boolean; autoPackageReady?: boolean; note?: string } = {},
): SetResult {
  const current = readBootstrapState(root);
  const curIdx = statusIndex(current.status);
  const nextIdx = statusIndex(next);

  if (nextIdx < curIdx)
    return { record: current, ok: false, why: `cannot regress: ${current.status} → ${next}` };

  const beyondReady = statusIndex('package_ready');
  if (nextIdx > beyondReady && !opts.confirm)
    return {
      record: current,
      ok: false,
      why: `${next} requires explicit human confirmation (--confirm). Nothing beyond package_ready is marked automatically.`,
    };

  const record: BootstrapStateRecord = {
    status: next,
    updatedAt: new Date().toISOString(),
    note: opts.note,
  };
  const p = bootstrapStatePath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(record, null, 2) + '\n');
  return { record, ok: true, why: `bootstrap state → ${next}` };
}

/** Advance to package_ready only if not already past it; auto (no confirm) allowed. */
export function advanceToPackageReady(root = ROOT, note?: string): SetResult {
  const current = readBootstrapState(root);
  const readyIdx = statusIndex('package_ready');
  if (statusIndex(current.status) >= readyIdx)
    return { record: current, ok: true, why: `already at/after package_ready (${current.status})` };
  return setBootstrapStatus(root, 'package_ready', { autoPackageReady: true, note });
}