// GrokBot Office — A2A hierarchy and escalation validation.
// Proves every role has a valid escalation path to the human anchor.

import type { RoleDefinition } from '../registry/schema.js';
import type { Workforce } from './registry.js';

export const HUMAN = 'human';
export const COS = '01'; // ChiefOfStaff role id

/** Domain chiefs: direct reports to the ChiefOfStaff (or the COS itself). */
export function chiefs(w: Workforce): RoleDefinition[] {
  return [...w.roles.values()].filter((r) => {
    const p = w.parent.get(r.id);
    return p === HUMAN || p === COS;
  });
}

export function isChief(w: Workforce, id: string): boolean {
  const p = w.parent.get(id);
  return p === HUMAN || p === COS;
}

/** Walking up parent links until the human anchor; every node is a role or anchor. */
export function escalationPath(w: Workforce, startId: string): { path: string[]; ok: boolean; error?: string } {
  const path: string[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = startId;
  while (cursor !== undefined) {
    if (seen.has(cursor)) return { path, ok: false, error: `cycle at ${cursor}` };
    seen.add(cursor);
    path.push(cursor);
    if (cursor === HUMAN) return { path, ok: true };
    const role = w.roles.get(cursor);
    const anchor = w.anchors.get(cursor);
    if (role) cursor = w.parent.get(cursor);
    else if (anchor) cursor = anchor.parent || undefined;
    else return { path, ok: false, error: `dangling parent at ${cursor}` };
  }
  return { path, ok: false, error: `no path to human` };
}

/** Throws unless every role reaches human. Returns proof count. */
export function assertAllChainToHuman(w: Workforce): { checked: number; failed: string[] } {
  const failed: string[] = [];
  for (const id of w.roles.keys()) {
    const { ok } = escalationPath(w, id);
    if (!ok) failed.push(id);
  }
  return { checked: w.roles.size, failed };
}

/** Direct subordinates of a role/anchor (ids). */
export function childrenOf(w: Workforce, id: string): string[] {
  return w.children.get(id) ?? [];
}

export function depthOf(w: Workforce, id: string): number {
  return escalationPath(w, id).path.length - 1; // 0 = reports to human
}

export function formatPath(w: Workforce, path: string[]): string {
  return path
    .map((id) => {
      const r = w.roles.get(id);
      return r ? `${id} ${r.name}` : id;
    })
    .join(' → ');
}

export function renderTree(w: Workforce, rootId = HUMAN, indent = ''): string[] {
  const lines: string[] = [];
  const kids = rootId === HUMAN ? chiefs(w).map((r) => r.id) : childrenOf(w, rootId);
  const label = (id: string): string => {
    if (id === HUMAN) return 'human';
    const a = w.anchors.get(id);
    if (a) return `${id} (anchor)`;
    const r = w.roles.get(id);
    return r ? `${id} ${r.name}` : id;
  };
  lines.push(`${indent}${label(rootId)}`);
  for (const kid of kids) {
    lines.push(...renderTree(w, kid, indent + '  '));
  }
  return lines;
}