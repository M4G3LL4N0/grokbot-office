// GrokBot Office — workforce loader and role resolver.
// Loads registry/roles.yaml + config/* and produces resolved RoleDefinition[]
// with all derived fields. Validation is explicit: every role must resolve a
// parent and reach the human anchor. No GrokBot is created by loading.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';

import { ROOT } from './paths.js';
import {
  type Anchor,
  type ApprovalBoundary,
  type BudgetClass,
  type DataClass,
  type LoaderContext,
  type RawRole,
  type RoleDefinition,
  type Tier,
  isActivation,
  isApprovalBoundary,
  isBudgetClass,
  isDataClass,
  isPriority,
  isTier,
  titleize,
  SECTION_BY_TIER,
} from '../registry/schema.js';

export const readText = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

export interface UsagePolicy {
  used_pct: number;
  remaining_pct: number;
  mode: 'conservation' | 'normal' | 'relaxed';
  conservation: {
    eligible_live_now: string[];
    max_live_roles: number;
    allow_new_live: boolean;
    audit_frequency: string;
    recovery_trigger: { used_under_pct: number; sustained_days: number };
  };
  normal: { core_persistent: string[]; high_value_ondemand: string[] };
  operating_guards: {
    no_autonomous_bot_creation: boolean;
    human_approval_required_for: string[];
    secrets_via: string[];
    no_money_movement_autonomy: boolean;
    no_purchase_autonomy: boolean;
    no_investment_execution_autonomy: boolean;
    no_legal_filing_autonomy: boolean;
    no_medical_autonomy: boolean;
    no_irreversible_account_change_autonomy: boolean;
  };
  token_budget_per_task: Record<BudgetClass, number>;
  stop_rules: string[];
}

export interface GroupTemplateBlueprint {
  desc: string;
  task_owner: string;
  members: string[];
  purpose: string;
}

export interface RoutineTemplateBlueprint {
  title: string;
  cadence: string;
  members: string[];
  purpose: string;
  consumer: string;
  status: 'template' | 'recommended';
  enabled: boolean;
  graduated: boolean;
}

export interface GroupTemplate extends GroupTemplateBlueprint {
  name: string;
  taskOwnerId: string;
  memberIds: string[];
}

export interface RoutineTemplate extends RoutineTemplateBlueprint {
  name: string;
  memberIds: string[];
}

export interface GroupsConfig {
  budget_defaults_by_tier: Partial<Record<Tier, BudgetClass>>;
  budget_overrides: Record<string, BudgetClass>;
  handoff_default: number;
  handoff_overrides: Record<string, number>;
  explicit_groups: Record<string, { desc: string; members: string[]; purpose: string }>;
  group_templates?: Record<string, GroupTemplateBlueprint>;
  routine_templates?: Record<string, RoutineTemplateBlueprint>;
}

export interface RoutingConfig {
  hub: string;
  head_of_office: string;
  escalation_chain: string[];
  cross_route: { chiefs_can_cross_route: boolean; gate: string; note: string };
  direct_peer_allowed_when: string[];
  banned_traffic: string[];
  subject_routes: Record<string, { chief: string; candidates: string[] }>;
  unrouted_default: string;
  stage: { one_owner_per_stage: boolean; handoff_echo: boolean };
}

export interface SecurityConfig {
  data_class_by_domain: Record<string, DataClass>;
  data_class_overrides: Record<string, DataClass>;
  highly_sensitive_roles?: string[];
  no_autonomous: string[];
  privileged_actions_require_approval: string[];
  secrets_policy: {
    never_in_prompt_config_git: boolean;
    transport: string[];
    connector_tokens_server_side: boolean;
    redact_on_failure: boolean;
    boot_message: string;
  };
  sensitive_data_handling: Record<string, boolean | string>;
  approval_overrides: Record<string, ApprovalBoundary>;
  internal_write_roles: string[];
  revenue_intelligence: { roles: string[]; consumers: string[]; note: string };
}

export interface RawRegistryFile {
  anchors?: Array<{ id: string; name: string; parent: string | null; note: string }>;
  roles: RawRole[];
}

export interface SmokeTaskConfig {
  default: Record<Tier, string>;
  overrides: Record<string, string>;
}

/** FIRST_SMOKE_TASK for a role: name override, else tier default. */
export function firstSmokeTask(w: Workforce, role: RoleDefinition): string {
  return w.smokeTasks.overrides[role.name] ?? w.smokeTasks.default[role.tier] ?? '';
}

export interface Workforce {
  kernel: string;
  policy: UsagePolicy;
  groups: GroupsConfig;
  routing: RoutingConfig;
  security: SecurityConfig;
  smokeTasks: SmokeTaskConfig;
  anchors: Map<string, Anchor>;
  roles: Map<string, RoleDefinition>;
  /** parent id -> child role ids (topological) */
  children: Map<string, string[]>;
  /** role id -> parent role/anchor id */
  parent: Map<string, string>;
  /** named group templates (never live groups) */
  groupTemplates: GroupTemplate[];
  /** routine templates (never active schedules) */
  routineTemplates: RoutineTemplate[];
}

const parseRole = (raw: RawRole): void => {
  if (!raw.id || !raw.name) throw new Error('roles.yaml: role missing id or name');
  if (!raw.parent) throw new Error(`roles.yaml: role ${raw.name} missing parent`);
  if (!isActivation(raw.activation)) throw new Error(`roles.yaml: ${raw.name} bad activation`);
  if (!isPriority(raw.priority)) throw new Error(`roles.yaml: ${raw.name} bad priority`);
  if (!isTier(raw.tier)) throw new Error(`roles.yaml: ${raw.name} bad tier`);
  if (!raw.mission) throw new Error(`roles.yaml: ${raw.name} missing mission`);
  if (raw.budgetClass !== undefined && !isBudgetClass(raw.budgetClass))
    throw new Error(`roles.yaml: ${raw.name} bad budgetClass`);
  if (raw.dataClass !== undefined && !isDataClass(raw.dataClass))
    throw new Error(`roles.yaml: ${raw.name} bad dataClass`);
  if (raw.approvalBoundary !== undefined && !isApprovalBoundary(raw.approvalBoundary))
    throw new Error(`roles.yaml: ${raw.name} bad approvalBoundary`);
};

export function loadWorkforce(root = ROOT): Workforce {
  const kernel = readText('config/kernel.txt').trim();
  const policy = loadYaml(readText('config/usage-policy.yaml')) as UsagePolicy;
  const groups = loadYaml(readText('config/groups.yaml')) as GroupsConfig;
  const routing = loadYaml(readText('config/routing.yaml')) as RoutingConfig;
  const security = loadYaml(readText('config/security-policy.yaml')) as SecurityConfig;
  const smokeTasks = loadYaml(readText('config/smoke-tasks.yaml')) as SmokeTaskConfig;
  const file = loadYaml(readText('registry/roles.yaml')) as RawRegistryFile;

  for (const r of file.roles) parseRole(r);

  // name -> id lookup over roles (anchors added below)
  const nameToId = new Map<string, string>();
  for (const r of file.roles) nameToId.set(r.name, r.id);

  const anchors = new Map<string, Anchor>();
  for (const a of file.anchors ?? []) {
    const resolvedParent = a.parent === null || a.parent === undefined ? '' : (nameToId.get(a.parent) ?? a.parent);
    anchors.set(a.id, {
      kind: 'anchor',
      id: a.id,
      name: a.name,
      parent: resolvedParent,
      note: a.note,
    });
  }
  for (const [id, a] of anchors) nameToId.set(id, id);

  const resolveParent = (raw: RawRole): string => {
    const pid = nameToId.get(raw.parent);
    if (pid) return pid;
    throw new Error(`role ${raw.name} parent '${raw.parent}' not found (no such role or anchor)`);
  };

  const roles = new Map<string, RoleDefinition>();
  const children = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  const ctx = {
    budgetOverrides: groups.budget_overrides ?? {},
    approvalOverrides: security.approval_overrides ?? {},
    dataClassOverrides: security.data_class_overrides ?? {},
    dataClassByDomain: security.data_class_by_domain ?? {},
    handoffOverrides: groups.handoff_overrides ?? {},
    handoffDefaultByTier: {},
    tagSources: {},
  } satisfies LoaderContext;

  for (const raw of file.roles) {
    if (roles.has(raw.id)) throw new Error(`duplicate role id ${raw.id}`);
    const parentId = resolveParent(raw);
    const role: RoleDefinition = {
      ...raw,
      kind: 'role',
      title: raw.title ?? titleize(raw.name),
      budgetClass: ctx.budgetOverrides[raw.name] ?? groups.budget_defaults_by_tier[raw.tier] ?? 'tiny',
      maxHandoffs: ctx.handoffOverrides[raw.name] ?? groups.handoff_default ?? 1,
      approvalBoundary:
        ctx.approvalOverrides[raw.name] ??
        (security.internal_write_roles?.includes(raw.name) ? 'internal_write' : 'information'),
      dataClass: ctx.dataClassOverrides[raw.name] ?? ctx.dataClassByDomain[raw.domain] ?? 'internal',
      allowedPeers: [],
      groupCandidates: [],
      routineCandidates: [],
      tags: [],
      highlySensitive: (security.highly_sensitive_roles ?? []).includes(raw.name),
    };
    roles.set(raw.id, role);
    parentOf.set(raw.id, parentId);
    const bucket = children.get(parentId) ?? [];
    bucket.push(raw.id);
    children.set(parentId, bucket);
  }

  // Explicit collaboration groups (members by role name; must resolve).
  const explicitMembers: Record<string, string[]> = {};
  for (const [gname, g] of Object.entries(groups.explicit_groups ?? {})) {
    explicitMembers[gname] = g.members.map((m) => {
      const mid = nameToId.get(m);
      if (!mid) throw new Error(`groups.yaml explicit_groups.${gname} member '${m}' not a role`);
      return mid;
    });
  }

  // Routines: role name members must resolve; track membership sets.
  const roleRoutines = new Map<string, Set<string>>(); // roleId -> routine names
  const routineIds = new Map<string, string[]>(); // routine name -> role ids
  for (const [rname, tpl] of Object.entries(groups.routine_templates ?? {})) {
    const ids = tpl.members.map((m) => {
      const mid = nameToId.get(m);
      if (!mid) throw new Error(`groups.yaml routine_templates.${rname} member '${m}' not a role`);
      return mid;
    });
    routineIds.set(rname, ids);
    for (const id of ids) {
      const s = roleRoutines.get(id) ?? new Set();
      s.add(rname);
      roleRoutines.set(id, s);
    }
  }

  // Named group templates — never live groups; hard cap 6 Bots.
  const groupTemplates: GroupTemplate[] = [];
  for (const [gname, tpl] of Object.entries(groups.group_templates ?? {})) {
    const memberIds = tpl.members.map((m) => {
      const mid = nameToId.get(m);
      if (!mid) throw new Error(`groups.yaml group_templates.${gname} member '${m}' not a role`);
      return mid;
    });
    if (memberIds.length > 6)
      throw new Error(`groups.yaml group_templates.${gname} has ${memberIds.length} bots (max 6)`);
    const taskOwnerId = nameToId.get(tpl.task_owner);
    if (!taskOwnerId)
      throw new Error(`groups.yaml group_templates.${gname} task_owner '${tpl.task_owner}' not a role`);
    if (!memberIds.includes(taskOwnerId))
      throw new Error(`groups.yaml group_templates.${gname} task_owner must be a member`);
    groupTemplates.push({ name: gname, taskOwnerId, memberIds, ...tpl });
  }

  // Routine templates — metadata only, never scheduled.
  const routineTemplates: RoutineTemplate[] = [];
  for (const [rname, tpl] of Object.entries(groups.routine_templates ?? {})) {
    const memberIds = routineIds.get(rname) ?? [];
    routineTemplates.push({
      name: rname,
      memberIds,
      title: tpl.title,
      cadence: tpl.cadence,
      members: tpl.members,
      purpose: tpl.purpose,
      consumer: tpl.consumer,
      status: tpl.status,
      enabled: tpl.enabled,
      graduated: tpl.graduated,
    });
  }

  for (const raw of file.roles) {
    const id = raw.id;
    const role = roles.get(id)!;
    const parentId = parentOf.get(id)!;

    const siblings = (children.get(parentId) ?? []).filter((s) => s !== id);
    const explicitSiblings: string[] = [];
    for (const members of Object.values(explicitMembers)) {
      if (members.includes(id)) {
        for (const m of members)
          if (m !== id && !explicitSiblings.includes(m)) explicitSiblings.push(m);
      }
    }
    const groupCandidates = [...new Set([...siblings, ...explicitSiblings])];

    const routineCandidates = [
      ...new Set(
        [...(roleRoutines.get(id) ?? [])].flatMap((g) => routineIds.get(g) ?? []).filter((x) => x !== id),
      ),
    ];

    role.allowedPeers = [...new Set([...groupCandidates, parentId])].filter((x) => x !== id);
    role.groupCandidates = groupCandidates;
    role.routineCandidates = routineCandidates;

    const tags = [SECTION_BY_TIER[role.tier], role.domain, role.priority, role.activation];
    if (role.highlySensitive) tags.push('highly-sensitive');
    if ((security.revenue_intelligence?.roles ?? []).includes(raw.name)) tags.push('revenue-intelligence');
    role.tags = tags;
  }

  return { kernel, policy, groups, routing, security, smokeTasks, anchors, roles, children, parent: parentOf, groupTemplates, routineTemplates };
}

export const parentOfRole = (w: Workforce, id: string): string | undefined => w.parent.get(id);