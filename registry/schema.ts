// GrokBot Office — canonical role schema.
// Roles are DATA, not bespoke code. This module defines the shape and the
// derivation rules (data-driven, sourced from config/). No GrokBot is
// created by loading this; it only produces definitions + status.

export type Activation = 'core' | 'warm' | 'ondemand' | 'dormant' | 'experimental';
export type Priority = 'core' | 'high' | 'advanced' | 'experimental';
export type Tier =
  | 'command'
  | 'engineering'
  | 'intelligence'
  | 'private-office'
  | 'family-office'
  | 'travel'
  | 'commerce'
  | 'content'
  | 'experimentation'
  | 'experimental';
export type BudgetClass = 'tiny' | 'small' | 'medium' | 'large';
export type DataClass = 'public' | 'internal' | 'confidential' | 'highly_sensitive';
export type ApprovalBoundary = 'information' | 'internal_write' | 'human_approval';
export type LiveState = 'eligible-live-now' | 'warm' | 'on-demand' | 'dormant' | 'experimental';
export type RoleKind = 'role' | 'anchor';

/** Raw record as authored in registry/roles.yaml. */
export interface RawRole {
  id: string;
  name: string;
  /** Optional human title; default derived from name. */
  title?: string;
  domain: string;
  priority: Priority;
  tier: Tier;
  /** Parent role id, or anchor id ('human' | 'agentos' | 'orgos'). */
  parent: string;
  mission: string;
  activation: Activation;
  /** Optional: role is designed as a persistent identity once a human activates it. This is a semantic annotation, NOT a materialization flag — loading a role never creates a bot. */
  identityPersistent?: boolean;
  /** Optional: default runtime posture for the role ('supervisor' | 'worker'). */
  runtimePreference?: string;
  budgetClass?: BudgetClass;
  maxHandoffs?: number;
  approvalBoundary?: ApprovalBoundary;
  dataClass?: DataClass;
}

/** Fully resolved role: author-authored fields + derived fields. */
export interface RoleDefinition extends RawRole {
  kind: 'role';
  title: string;
  budgetClass: BudgetClass;
  maxHandoffs: number;
  approvalBoundary: ApprovalBoundary;
  dataClass: DataClass;
  /** Peers this role may message directly under A2A direct-peering rules. */
  allowedPeers: string[];
  /** Candidate roles for multi-bot group chats (owned-outcome groups). */
  groupCandidates: string[];
  /** Candidate role ids this role may propose/assign via routines. */
  routineCandidates: string[];
  tags: string[];
  /** True when the role is on the highly-sensitive list (strictest rules). */
  highlySensitive: boolean;
}

export interface Anchor {
  kind: 'anchor';
  id: string;
  name: string;
  parent: string;
  note: string;
}

export type Entity = RoleDefinition | Anchor;

/** Defaults keyed by the raw record. Applied by resolveRole(). */
export interface LoaderContext {
  budgetOverrides: Record<string, BudgetClass>;
  approvalOverrides: Record<string, ApprovalBoundary>;
  dataClassOverrides: Record<string, DataClass>;
  dataClassByDomain: Record<string, DataClass>;
  handoffOverrides: Record<string, number>;
  handoffDefaultByTier: Record<string, number>;
  tagSources: Record<string, string[]>;
}

/** Turn 'ChiefOfStaff' -> 'Chief of Staff' (reusable, no prose). */
export const titleize = (name: string): string => {
  const STOP = new Set(['of', 'to', 'in', 'by', 'at', 'the', 'and']);
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/\s+/);
  return words
    .map((w, i) => {
      if (w.length === 1) return w.toUpperCase(); // acronym letter (e.g. CIO)
      if (i === 0) return w[0]!.toUpperCase() + w.slice(1);
      if (STOP.has(w.toLowerCase())) return w.toLowerCase();
      return w[0]!.toUpperCase() + w.slice(1);
    })
    .join(' ');
};

export const DOMAINS: Tier[] = [
  'command',
  'engineering',
  'intelligence',
  'private-office',
  'family-office',
  'travel',
  'commerce',
  'content',
  'experimentation',
  'experimental',
];

/** Official sourcing sections (the numbering scheme these roles came from). */
export const SECTION_BY_TIER: Record<Tier, string> = {
  command: 'TIER S / COMMAND',
  engineering: 'PROJECT/ENGINEERING',
  intelligence: 'INTELLIGENCE/RESEARCH',
  'private-office': 'PRIVATE OFFICE',
  'family-office': 'FAMILY OFFICE',
  travel: 'TRAVEL / PHYSICAL LIFE',
  commerce: 'OPPORTUNITY / COMMERCE',
  content: 'CULTURE / CONTENT',
  experimentation: 'EXPERIMENTATION',
  experimental: 'EXPERIMENTAL / ABSURD',
};

export const ANCHOR_IDS = ['human', 'agentos', 'orgos'] as const;

export const isActivation = (v: unknown): v is Activation =>
  ['core', 'warm', 'ondemand', 'dormant', 'experimental'].includes(v as string);

export const isPriority = (v: unknown): v is Priority =>
  ['core', 'high', 'advanced', 'experimental'].includes(v as string);

export const isTier = (v: unknown): v is Tier => (DOMAINS as string[]).includes(v as string);

export const isBudgetClass = (v: unknown): v is BudgetClass =>
  ['tiny', 'small', 'medium', 'large'].includes(v as string);

export const isDataClass = (v: unknown): v is DataClass =>
  ['public', 'internal', 'confidential', 'highly_sensitive'].includes(v as string);

export const isApprovalBoundary = (v: unknown): v is ApprovalBoundary =>
  ['information', 'internal_write', 'human_approval'].includes(v as string);