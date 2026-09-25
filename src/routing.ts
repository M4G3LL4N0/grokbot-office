// GrokBot Office — subject routing + legal handoff resolution under A2A law.
// specialist → domain chief → ChiefOfStaff → human.
// Chiefs may cross-route; direct specialist↔specialist only under the
// three conditions from routing.yaml.

import type { ApprovalBoundary, BudgetClass, DataClass, RoleDefinition } from '../registry/schema.js';
import type { Workforce } from './registry.js';
import type { UsageBand } from './usage.js';
import { currentBand } from './budget.js';
import { COS, HUMAN, chiefs, escalationPath, isChief } from './hierarchy.js';

export const ESCALATION_CHAIN = ['specialist', 'chief', 'ChiefOfStaff', 'human'];

export interface RouteMatch {
  chief: RoleDefinition;
  candidates: RoleDefinition[];
  matchedRule?: string;
}

/** Resolve a role by id or name (roles map is keyed by id). */
function byIdOrName(w: Workforce, idOrName: string): RoleDefinition | undefined {
  const direct = w.roles.get(idOrName);
  if (direct) return direct;
  return [...w.roles.values()].find((r) => r.name === idOrName);
}

/** Route a task subject to candidates, favoring early keyword matches. */
export function routeFor(w: Workforce, subject?: string): RouteMatch | null {
  const rules = Object.entries(w.routing.subject_routes ?? {});
  const hay = (subject ?? '').toLowerCase();
  if (subject) {
    for (const [keywords, rule] of rules) {
      const keys = keywords.split('/').map((k) => k.trim()).filter((k) => k.length > 2);
      if (keys.some((k) => hay.includes(k))) {
        const chief = byIdOrName(w, rule.chief) ?? byIdOrName(w, w.routing.hub);
        if (!chief) continue;
        return {
          chief,
          candidates: rule.candidates
            .map((c) => byIdOrName(w, c))
            .filter((c): c is RoleDefinition => c !== undefined),
          matchedRule: keywords,
        };
      }
    }
  }
  const fallback = byIdOrName(w, w.routing.unrouted_default);
  if (!fallback) return null;
  return { chief: fallback, candidates: chiefs(w) };
}

export interface HandoffDecision {
  from: string;
  to: string;
  allowed: boolean;
  reason: string;
  path: string[];
}

/**
 * Is a direct from→to handoff legal?
 * Legal if (a) same chief (peer/sibling), (b) parent/child edge, (c) to the
 * human/COS, or (d) direct peering proven by subject (single task, cheaper,
 * non-overlapping). Otherwise route via chiefs.
 */
export function legalHandoff(w: Workforce, fromId: string, toId: string, subject?: string): HandoffDecision {
  const from = w.roles.get(fromId);
  const to = w.roles.get(toId);
  if (!from || !to) return { from: fromId, to: toId, allowed: false, reason: 'unknown role', path: [] };

  if (toId === HUMAN) return { from: fromId, to: toId, allowed: true, reason: 'escalation to human', path: [fromId, HUMAN] };
  if (toId === COS) {
    return { from: fromId, to: toId, allowed: true, reason: 'escalation to ChiefOfStaff', path: escalationPath(w, fromId).path };
  }

  const fromParent = w.parent.get(fromId);
  const toParent = w.parent.get(toId);
  const sameChief = fromParent !== undefined && fromParent === toParent;
  const directEdge =
    fromParent === toId ||
    (w.children.get(fromId) ?? []).includes(toId) ||
    (w.children.get(toId) ?? []).includes(fromId);

  if (sameChief) {
    return { from: fromId, to: toId, allowed: true, reason: 'same chief (peer)', path: [fromId, toId] };
  }
  if (directEdge) {
    return { from: fromId, to: toId, allowed: true, reason: 'direct parent/child edge', path: [fromId, toId] };
  }

  // cross-chief: permitted only when the subject names a single defined task
  // routed by that same chief — cheaper than routing through the chiefs.
  if (subject && subject.length > 8) {
    const routed = routeFor(w, subject);
    const fromChief = fromParent !== undefined && (fromParent === COS || fromParent === HUMAN) ? fromId : fromParent;
    const toChief = toParent !== undefined && (toParent === COS || toParent === HUMAN) ? toId : toParent;
    const routedChief = routed?.chief.id ?? '';
    if (routedChief === toChief || routedChief === toId) {
      return {
        from: fromId,
        to: toId,
        allowed: true,
        reason: 'direct peer justified by single defined task routing to the target chief',
        path: [fromId, toId],
      };
    }
  }

  // otherwise route specialist → own chief → owning chief → target
  const fromChiefPath = fromParent === COS || fromParent === HUMAN ? fromId : fromParent ?? COS;
  const toChief = toParent === COS || toParent === HUMAN ? toId : toParent ?? COS;
  return {
    from: fromId,
    to: toId,
    allowed: fromChiefPath === toChief,
    reason:
      fromChiefPath === toChief
        ? 'same chief via chain'
        : `cross-chief: ${fromId}→${fromChiefPath}→${toChief}→${toId} requires chief-to-chief agreement`,
    path: [fromId, fromChiefPath, toChief, toId].filter((x, i, a) => a.indexOf(x) === i),
  };
}

export function escalationRoot(w: Workforce, id: string): string {
  return escalationPath(w, id).path.at(-1) ?? HUMAN;
}

export interface RouteDecision {
  subject: string;
  matchedRule: string | null;
  owner: RoleDefinition;
  specialist: RoleDefinition | null;
  candidates: RoleDefinition[];
  escalation: string[];
  band: UsageBand;
  ownerLive: boolean;
  budgetClass: BudgetClass;
  tokensPerTask: number;
  maxSpecialistsPerRequest: number;
  groupJustified: boolean;
  proactiveDisabled: boolean;
  blocked: boolean;
  blockReason: string | null;
  approvalBoundary: ApprovalBoundary;
  dataClass: DataClass;
}

/**
 * Task router: given a task subject, output the owning chief, one optional
 * specialist, escalation path, recommended mode (usage band), estimated
 * budgetClass, whether a group is justified, and whether current policy blocks
 * it. Pure decision — never triggers execution.
 */
export function routeTask(w: Workforce, subject: string): RouteDecision {
  const band = currentBand(w);
  const m = routeFor(w, subject);
  const owner = (m?.chief ?? byIdOrName(w, w.routing.unrouted_default) ?? chiefs(w)[0]!)!;
  const candidates = m?.candidates ?? chiefs(w);
  const specialist = candidates.find((c) => c.id !== owner.id && !isChief(w, c.id)) ?? null;

  const { path } = escalationPath(w, owner.id);
  const tokensPerTask = w.policy.token_budget_per_task[owner.budgetClass] ?? 5000;
  const groupJustified = band.groupsAllowed !== 'never' && candidates.length >= 4;
  const ownerLive = band.liveCore.includes(owner.id);
  const experimentalInvolved = candidates.some((c) => c.activation === 'experimental');

  let blocked = false;
  let blockReason: string | null = null;
  if (!ownerLive) {
    blocked = true;
    blockReason = `owner not live in ${band.label}: allowed core is ${band.liveCore.join('/')}`;
  } else if (band.experimentalBlocked && experimentalInvolved) {
    blocked = true;
    blockReason = `${band.label}: experimental roles blocked`;
  }

  const approvalBoundary: ApprovalBoundary =
    specialist?.approvalBoundary === 'human_approval' ? 'human_approval' : owner.approvalBoundary;
  const dataClass = specialist && specialist.dataClass !== 'public' ? specialist.dataClass : owner.dataClass;

  return {
    subject,
    matchedRule: m?.matchedRule ?? null,
    owner,
    specialist,
    candidates,
    escalation: path,
    band,
    ownerLive,
    budgetClass: owner.budgetClass,
    tokensPerTask,
    maxSpecialistsPerRequest: band.maxSpecialistsPerRequest,
    groupJustified,
    proactiveDisabled: !band.proactiveResearch,
    blocked,
    blockReason,
    approvalBoundary,
    dataClass,
  };
}

export { isChief };