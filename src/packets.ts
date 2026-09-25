// GrokBot Office — canonical A2A packets (TASK/RESULT/ESCALATE).
// No greetings. No acknowledgements. No summaries of summaries.

export type PacketKind = 'TASK' | 'RESULT' | 'ESCALATE';

export interface TaskPacket {
  kind: 'TASK';
  from: string;
  to: string;
  goal: string;
  context: string;
  constraints: string;
  deliverable: string;
}

export interface ResultPacket {
  kind: 'RESULT';
  from: string;
  to: string;
  facts: string[];
  action: string;
  confidence: number; // 0..1
  blocker?: string;
}

export interface EscalatePacket {
  kind: 'ESCALATE';
  from: string;
  issue: string;
  whyHuman: string;
  options: string[];
}

export type Packet = TaskPacket | ResultPacket | EscalatePacket;

const requireNonEmpty = (v: unknown, label: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`packet: ${label} required`);
  return v.trim();
};

export function taskPacket(p: Omit<TaskPacket, 'kind'>): TaskPacket {
  requireNonEmpty(p.from, 'from');
  requireNonEmpty(p.to, 'to');
  requireNonEmpty(p.goal, 'goal');
  requireNonEmpty(p.deliverable, 'deliverable');
  return { kind: 'TASK', ...p };
}

export function resultPacket(p: Omit<ResultPacket, 'kind'> & { confidence?: number }): ResultPacket {
  requireNonEmpty(p.from, 'from');
  requireNonEmpty(p.to, 'to');
  const confidence = p.confidence ?? -1;
  if (confidence < 0 || confidence > 1) throw new Error('packet: confidence must be 0..1');
  if (!p.action) throw new Error('packet: action required (use "none" or "recommend <x>")');
  return {
    kind: 'RESULT',
    from: p.from,
    to: p.to,
    facts: p.facts ?? [],
    action: p.action.trim(),
    confidence,
    blocker: p.blocker,
  };
}

export function escalatePacket(p: Omit<EscalatePacket, 'kind'>): EscalatePacket {
  requireNonEmpty(p.issue, 'issue');
  requireNonEmpty(p.whyHuman, 'whyHuman');
  return { kind: 'ESCALATE', from: (p.from ?? '').trim(), issue: p.issue.trim(), whyHuman: p.whyHuman.trim(), options: p.options ?? [] };
}

/** Low-signal chatter detection — banned under A2A. */
export const isChatter = (text: string): boolean => {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  if (t.length < 4) return true;
  const tokens = ['thanks', 'thank you', 'got it', 'sounds good', 'great', 'ok ', 'sure, ', 'will do', 'gotcha', '👍', '🙏', '🙌', 'no problem', 'no worries', 'noted', 'just to confirm', 'acknowledge', 'per my previous'];
  return tokens.some((tk) => t.startsWith(tk) && t.length < 180);
};

/** Parse the canonical pipe-format packet line, or throw. */
export function parsePacket(line: string): Packet {
  const kindM = /^(TASK|RESULT|ESCALATE)\|/.exec(line.trim());
  if (!kindM) {
    if (isChatter(line)) throw new Error('packet: low-signal chatter rejected');
    throw new Error('packet: must start with TASK|, RESULT|, or ESCALATE|');
  }
  const kind = kindM[1] as PacketKind;
  const body = line.trim().slice(kindM[0].length);
  let parts = body.split('|').map((p) => p.trim());
  // first segment may be 'from→to' (canonical) or separate from|to (relaxed)
  if (parts[0]?.includes('→')) {
    const [from = '', to = ''] = parts[0].split('→').map((p) => p.trim());
    parts = [from, to, ...parts.slice(1)];
  }
  if (kind === 'ESCALATE') {
    // Canonical: ESCALATE|issue|why|options
    // Relaxed/legacy: ESCALATE|from|issue|why|options
    if (parts.length >= 4) {
      const [from, issue, whyHuman, options] = parts;
      return escalatePacket({
        from: from ?? '',
        issue: issue ?? '',
        whyHuman: whyHuman ?? '',
        options: (options ?? '').split(';').map((o) => o.trim()).filter(Boolean),
      });
    }
    const [issue, whyHuman, options] = parts;
    return escalatePacket({
      from: '',
      issue: issue ?? '',
      whyHuman: whyHuman ?? '',
      options: (options ?? '').split(';').map((o) => o.trim()).filter(Boolean),
    });
  }
  if (kind === 'TASK') {
    const [from, to, goal, context, constraints, deliverable] = parts;
    return taskPacket({ from: from ?? '', to: to ?? '', goal: goal ?? '', context: context ?? '', constraints: constraints ?? '', deliverable: deliverable ?? '' });
  }
  // RESULT — canonical header is requester→responder (to→from), so that the
  // task recipient answers back to the requester.
  const [to, from, facts, action, confidenceRaw, blocker] = parts;
  const confidence = confidenceRaw === undefined ? -1 : Number(confidenceRaw);
  if (Number.isNaN(confidence)) throw new Error('packet: RESULT confidence must be a number 0..1');
  return resultPacket({
    from: from ?? '',
    to: to ?? '',
    facts: (facts ?? '').split(';').map((f) => f.trim()).filter(Boolean),
    action: action ?? '',
    confidence,
    blocker,
  });
}

export function serializePacket(p: Packet): string {
  if (p.kind === 'TASK') {
    return `TASK|${p.from}→${p.to}|${p.goal}|${p.context}|${p.constraints}|${p.deliverable}`;
  }
  if (p.kind === 'RESULT') {
    const facts = p.facts.join('; ');
    return `RESULT|${p.to}→${p.from}|${facts}|${p.action}|${p.confidence}${p.blocker ? `|${p.blocker}` : ''}`;
  }
  return `ESCALATE|${p.issue}|${p.whyHuman}|${p.options.join('; ')}`;
}