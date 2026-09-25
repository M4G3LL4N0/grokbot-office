export type Activation = 'core' | 'warm' | 'ondemand' | 'dormant' | 'experimental';
export type Priority = 'core' | 'high' | 'advanced' | 'experimental';
export type Tier = 'command' | 'engineering' | 'intelligence' | 'private-office' | 'family-office' | 'travel' | 'commerce' | 'content' | 'experimentation' | 'experimental';
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
export declare const titleize: (name: string) => string;
export declare const DOMAINS: Tier[];
/** Official sourcing sections (the numbering scheme these roles came from). */
export declare const SECTION_BY_TIER: Record<Tier, string>;
export declare const ANCHOR_IDS: readonly ["human", "agentos", "orgos"];
export declare const isActivation: (v: unknown) => v is Activation;
export declare const isPriority: (v: unknown) => v is Priority;
export declare const isTier: (v: unknown) => v is Tier;
export declare const isBudgetClass: (v: unknown) => v is BudgetClass;
export declare const isDataClass: (v: unknown) => v is DataClass;
export declare const isApprovalBoundary: (v: unknown) => v is ApprovalBoundary;
