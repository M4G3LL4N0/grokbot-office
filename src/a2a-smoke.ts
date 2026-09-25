// GrokBot Office — minimum-cost A2A smoke test (Part B item 2).
// ChiefOfStaff tasks ProjectsChief / IntelligenceChief to confirm the
// hierarchy agreement, in the exact native pipe format. The human-readable
// expectation ("role=projects command") stays in the manual deliverable; the
// native round-trip uses canonical RESULT confidence 0..1. No external calls,
// no bot messages — this module only validates the canonical packets and the
// registry facts a bot would have to answer with.

import type { Workforce } from './registry.js';
import { parsePacket, serializePacket } from './packets.js';

export interface A2aSmokeSpec {
  responder: string;
  responderRoleId: string;
  taskLine: string;
  expectedFactsToCheck: string[];
}

/** Mission-exact A2A smoke spec (deliverable item 2), registry-verified. */
export const A2A_SMOKE_SPEC: A2aSmokeSpec[] = [
  {
    responder: 'ProjectsChief',
    responderRoleId: '03',
    taskLine:
      'TASK|ChiefOfStaff→ProjectsChief|confirm hierarchy|none|no external action|return parent+role in one line',
    expectedFactsToCheck: ['parent=ChiefOfStaff', 'role=projects command'],
  },
  {
    responder: 'IntelligenceChief',
    responderRoleId: '02',
    taskLine:
      'TASK|ChiefOfStaff→IntelligenceChief|confirm hierarchy|none|no external action|return parent+role in one line',
    expectedFactsToCheck: ['parent=ChiefOfStaff', 'role=intelligence command'],
  },
];

export interface A2aSmokeResult {
  pass: boolean;
  responder: string;
  taskRoundTrip: boolean;
  resultRoundTrip: boolean;
  hierarchyMatches: boolean;
  hierarchyFacts: string[];
  canonicalResultLine: string;
  notes: string[];
}

/**
 * Native smoke: the responder (ProjectsChief / IntelligenceChief) must be
 * parented to ChiefOfStaff, and the canonical TASK + RESULT lines must
 * round-trip exactly through the packet parser/serializer.
 */
export function a2aSmokeFor(w: Workforce, spec: A2aSmokeSpec): A2aSmokeResult {
  const notes: string[] = [];
  let taskRoundTrip = false;
  try {
    const parsed = parsePacket(spec.taskLine);
    taskRoundTrip = serializePacket(parsed) === spec.taskLine;
    notes.push(taskRoundTrip ? 'TASK round-trips exactly' : 'TASK packet mismatch');
  } catch (e) {
    notes.push(`TASK parse error: ${(e as Error).message}`);
  }

  // canonical numeric RESULT: requester→responder (to→from) as the wire format
  const facts = spec.expectedFactsToCheck.join('; ');
  const canonical = `RESULT|ChiefOfStaff→${spec.responder}|${facts}|none|1|none`;
  let resultRoundTrip = false;
  try {
    const parsed = parsePacket(canonical);
    resultRoundTrip =
      serializePacket(parsed) === canonical &&
      parsed.kind === 'RESULT' &&
      parsed.confidence === 1 &&
      parsed.action === 'none';
    notes.push(resultRoundTrip ? 'RESULT round-trips exactly (confidence 1)' : 'RESULT packet mismatch');
  } catch (e) {
    notes.push(`RESULT parse error: ${(e as Error).message}`);
  }

  const hierarchyFacts: string[] = [];
  const responder = w.roles.get(spec.responderRoleId);
  const parentLabel = w.parent.get(spec.responderRoleId);
  const parentOk = parentLabel === '01';
  const expectedNamePrefix = spec.responderRoleId === '03' ? 'projects' : 'intelligence';
  const nameOk = (responder?.name ?? '').toLowerCase().startsWith(expectedNamePrefix);
  if (parentOk) {
    hierarchyFacts.push('parent=ChiefOfStaff');
  } else {
    hierarchyFacts.push(
      `parent=${parentLabel ?? 'unknown'} (expected ChiefOfStaff — registry mismatch)`,
    );
  }
  hierarchyFacts.push(
    `role=${responder ? responder.name.toLowerCase().replace(/chief$/i, ' command') : 'unknown'}`,
  );
  const hierarchyOk = parentOk && nameOk;

  return {
    pass: taskRoundTrip && resultRoundTrip && hierarchyOk,
    responder: spec.responder,
    taskRoundTrip,
    resultRoundTrip,
    hierarchyMatches: hierarchyOk,
    hierarchyFacts,
    canonicalResultLine: canonical,
    notes,
  };
}

export function a2aSmokeTest(w: Workforce): A2aSmokeResult[] {
  return A2A_SMOKE_SPEC.map((spec) => a2aSmokeFor(w, spec));
}

/** Moment-of-truth question the human asks after the bot answers. */
export const SMOKE_ANSWER_ACCEPTANCE =
  'Accept only a single bounded line of the form "parent=<PARENT>; role=<ROLE>". ' +
  'Anything verbose, invented, or exceeding one line fails the smoke.';