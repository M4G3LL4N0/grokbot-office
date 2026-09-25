// GrokBot Office — export helpers: deterministic artifacts written to
// generated/ (gitignored, reproducible). Never auto-deploys.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './paths.js';
import { serializePacket } from './packets.js';
import type { Workforce } from './registry.js';
import { allStates, usageReport } from './budget.js';
import { compileAll } from './compiler.js';
import { assertAllChainToHuman, escalationPath, renderTree } from './hierarchy.js';

export interface ExportReport {
  files: string[];
  roles: number;
  anchors: number;
  states: Record<string, number>;
  escalation: { checked: number; failed: string[] };
  headroomPct: number;
}

export function writeGenerated(w: Workforce, force = true): ExportReport {
  if (!force) {
    // dry-run mode used by CLI --dry
    return {
      files: [],
      roles: w.roles.size,
      anchors: w.anchors.size,
      states: countStates(w),
      escalation: assertAllChainToHuman(w),
      headroomPct: usageReport(w).headroom,
    };
  }

  const out: string[] = [];
  const gen = join(ROOT, 'generated');
  mkdirSync(gen, { recursive: true });

  const states = allStates(w);
  const stateHistogram = countStates(w);
  const compiled = compileAll(w);
  const report = usageReport(w);

  const workforceJson = {
    generatedAt: new Date().toISOString().slice(0, 10),
    kernel: w.kernel,
    mode: report.mode,
    usage: { usedPct: report.usedPct, remainingPct: report.remainingPct, headroom: report.headroom },
    license: 0,
    roles: states.map((s) => ({
      id: s.role.id,
      name: s.role.name,
      title: s.role.title,
      tier: s.role.tier,
      section: s.role.tags[0],
      priority: s.role.priority,
      parent: w.parent.get(s.role.id),
      state: s.state,
      budgetClass: s.role.budgetClass,
      budget: s.tokenPerTask,
      approval: s.role.approvalBoundary,
      data: s.role.dataClass,
      maxHandoffs: s.role.maxHandoffs,
      peers: s.role.allowedPeers,
    })),
    compiledPrompts: compiled.map((c) => ({ id: c.roleId, name: c.name, prompt: c.prompt })),
    anchors: [...w.anchors.values()].map((a) => ({ id: a.id, parent: a.parent, note: a.note })),
  };
  const wfPath = join(gen, 'workforce.json');
  writeFileSync(wfPath, JSON.stringify(workforceJson, null, 2));
  out.push(wfPath);

  // TSV setup profiles (paste-ready seeding cards)
  const tsvPath = join(gen, 'setup-profiles.tsv');
  const header = ['id', 'name', 'title', 'state', 'parent', 'approval', 'data', 'prompt'];
  const rows = states.map((s) => {
    const prompt = compiled.find((c) => c.roleId === s.role.id)?.prompt ?? '';
    return [
      s.role.id,
      s.role.name,
      s.role.title,
      s.state,
      w.parent.get(s.role.id) ?? '',
      s.role.approvalBoundary,
      s.role.dataClass,
      prompt.replace(/\n/g, ' | '),
    ];
  });
  writeFileSync(tsvPath, [header.join('\t'), ...rows.map((r) => r.map(esc).join('\t'))].join('\n'));
  out.push(tsvPath);

  // Escalation manifest (proof every role reaches human)
  const escPath = join(gen, 'escalation.json');
  const escalations: Record<string, string[]> = {};
  for (const id of w.roles.keys()) {
    const { path } = escalationPath(w, id);
    escalations[id] = path;
  }
  writeFileSync(escPath, JSON.stringify(escalations, null, 2));
  out.push(escPath);

  // Routing table (compact)
  const routePath = join(gen, 'routing-table.tsv');
  const rHeader = ['subject', 'chief', 'candidates'];
  const rRows = Object.entries(w.routing.subject_routes ?? {}).map(([subject, rule]) => [
    subject,
    rule.chief,
    (rule.candidates ?? []).join(', '),
  ]);
  writeFileSync(routePath, [rHeader.join('\t'), ...rRows.map((r) => r.join('\t'))].join('\n'));
  out.push(routePath);

  // Example packets reference
  const packetPath = join(gen, 'packet-examples.txt');
  const ex = [
    serializePacket({
      kind: 'TASK',
      from: '03 ProjectsChief',
      to: '16 AutonomousQA',
      goal: 'Reproduce defect D-42',
      context: 'stack: repo X, branch main',
      constraints: 'no prod writes',
      deliverable: 'RESULT with severity+repro',
    }),
    serializePacket({
      kind: 'RESULT',
      from: '16 AutonomousQA',
      to: '03 ProjectsChief',
      facts: ['reproduced on main', 'exits 1 with stack'],
      action: 'recommend fix in signing module',
      confidence: 0.9,
    }),
    serializePacket({
      kind: 'ESCALATE',
      from: '57 FamilyCFO',
      issue: 'liquidity gap next 30d',
      whyHuman: 'money movement requires human approval',
      options: ['delay capex', 'draw on line of credit', 'sell short-term assets'],
    }),
  ].join('\n');
  writeFileSync(packetPath, ex);
  out.push(packetPath);

  // tree view
  const treePath = join(gen, 'hierarchy.txt');
  writeFileSync(treePath, renderTree(w).join('\n'));
  out.push(treePath);

  return {
    files: out,
    roles: w.roles.size,
    anchors: w.anchors.size,
    states: stateHistogram,
    escalation: assertAllChainToHuman(w),
    headroomPct: report.headroom,
  };
}

const countStates = (w: Workforce): Record<string, number> => {
  const hist: Record<string, number> = {};
  for (const s of allStates(w)) hist[s.state] = (hist[s.state] ?? 0) + 1;
  return hist;
};

const esc = (s: string): string => s.replace(/\t/g, ' ').replace(/\r/g, '');