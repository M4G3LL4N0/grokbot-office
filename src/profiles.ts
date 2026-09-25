// GrokBot Office — profile compiler output.
// A GrokBot "profile card" is the exact NAME/TITLE/DESCRIPTION/PARENT/
// ACTIVATION/FIRST_SMOKE_TASK/OPTIONAL_GROUPS tuple a human pastes into Cursor
// GrokBot (MANUAL STEP). Compactness is measured (chars + approx tokens) and
// over-large/duplicated prompts fail tests.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './paths.js';
import type { RoleDefinition } from '../registry/schema.js';
import type { Workforce } from './registry.js';
import { firstSmokeTask } from './registry.js';
import { compileAll, compileRole } from './compiler.js';
import { roleState } from './budget.js';
import { chiefs } from './hierarchy.js';

export interface ProfileCard {
  id: string;
  name: string;
  title: string;
  description: string;
  parent: string;
  activation: string;
  firstSmokeTask: string;
  optionalGroups: string[];
  state: string;
  budgetClass: string;
  approvalBoundary: string;
  dataClass: string;
  highlySensitive: boolean;
  chars: number;
  tokens: number;
  lines: number;
}

export const approxTokens = (s: string): number => Math.ceil(s.length / 4);

export function buildProfile(w: Workforce, id: string): ProfileCard | null {
  const compiled = compileRole(w, id);
  const role = w.roles.get(id);
  if (!compiled || !role) return null;
  const st = roleState(w, id)!;

  const inTemplates = w.groupTemplates
    .filter((t) => t.memberIds.includes(id))
    .map((t) => t.name);
  const fallback = role.groupCandidates.slice(0, Math.max(0, 6 - inTemplates.length));
  const optionalGroups = [...new Set([...inTemplates, ...fallback])].slice(0, 6);

  return {
    id: role.id,
    name: role.name,
    title: role.title,
    description: compiled.prompt,
    parent: parentLabel(w, id),
    activation: role.activation,
    firstSmokeTask: firstSmokeTask(w, role),
    optionalGroups,
    state: st.state,
    budgetClass: role.budgetClass,
    approvalBoundary: role.approvalBoundary,
    dataClass: role.dataClass,
    highlySensitive: role.highlySensitive,
    chars: compiled.chars,
    tokens: compiled.tokens,
    lines: compiled.prompt.split('\n').length,
  };
}

export function parentLabel(w: Workforce, id: string): string {
  const p = w.parent.get(id) ?? '';
  const role = w.roles.get(p);
  if (role) return role.name;
  return p; // anchor id
}

export function buildAllProfiles(w: Workforce): ProfileCard[] {
  return [...w.roles.keys()]
    .map((id) => buildProfile(w, id)!)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export interface ProfileWriteReport {
  /**
   * Deterministic content: files written in this run with normalized content
   * (used by doctor to prove exports are reproducible).
   */
  files: string[];
  manifest: Record<string, ProfileCard>;
  maxChars: number;
  maxLines: number;
}

/** Ordered like the Compiler, the top roster = chiefs + current eligible live. */
export function topRoster(w: Workforce): RoleDefinition[] {
  const cs = chiefs(w).slice();
  const inLive = [...w.roles.values()].filter((r) => roleState(w, r.id)?.state === 'eligible-live-now');
  const seen = new Set(cs.map((r) => r.id));
  for (const r of inLive) if (!seen.has(r.id)) cs.push(r);
  return cs;
}

/** Write generated/profiles/<id>.md, profiles.json, ALL_ROLES.md, TOP_ROLES.md. */
export function writeProfiles(w: Workforce, outDir = join(ROOT, 'generated')): { files: string[]; profiles: ProfileCard[] } {
  const profiles = buildAllProfiles(w);
  const profileDir = join(outDir, 'profiles');
  mkdirSync(profileDir, { recursive: true });

  const files: string[] = [];
  for (const p of profiles) {
    const md = renderProfile(p);
    const f = join(profileDir, `${p.id}.md`);
    writeFileSync(f, md);
    files.push(f);
  }

  const manifest: Record<string, ProfileCard> = {};
  for (const p of profiles) manifest[p.id] = p;
  const manifestPath = join(outDir, 'profiles.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  files.push(manifestPath);

  const allPath = join(outDir, 'ALL_ROLES.md');
  const allLines = profiles.map(
    (p) => `- [${p.id}] ${p.name} — ${p.activation}/${p.state} · parent ${p.parent} · ${p.budgetClass} · data ${p.dataClass} · ~${p.tokens} tok`,
  );
  writeFileSync(allPath, `# All Roles (${profiles.length})\n\n${allLines.join('\n')}\n`);
  files.push(allPath);

  const top = topRoster(w).map((r) => buildProfile(w, r.id)!).filter(Boolean);
  const topPath = join(outDir, 'TOP_ROLES.md');
  const topLines = top.map(renderProfileMarkdown);
  writeFileSync(
    topPath,
    `# Top Roster — Chiefs + current eligible live\n\n${topLines.join('\n---\n')}\n`,
  );
  files.push(topPath);

  return { files, profiles };
}

/** Compact single-card text; the copy/paste profile card. */
export function renderProfile(p: ProfileCard): string {
  return [
    `NAME ${p.name}`,
    `TITLE ${p.title}`,
    '',
    'DESCRIPTION',
    p.description,
    '',
    `PARENT ${p.parent}`,
    `ACTIVATION ${p.activation}`,
    `FIRST_SMOKE_TASK ${p.firstSmokeTask}`,
    `OPTIONAL_GROUPS${p.optionalGroups.length ? '' : ' none'}`,
    ...p.optionalGroups.map((g) => `  ${g}`),
    '',
    `# internal: id=${p.id} state=${p.state} budget=${p.budgetClass} approval=${p.approvalBoundary} data=${p.dataClass}`,
    `# compactness: ${p.chars} chars / ~${p.tokens} tokens / ${p.lines} lines`,
  ].join('\n') + '\n';
}

const renderProfileMarkdown = (p: ProfileCard): string => renderProfile(p);

export { compileAll };