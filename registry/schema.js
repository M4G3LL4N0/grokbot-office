// GrokBot Office — canonical role schema.
// Roles are DATA, not bespoke code. This module defines the shape and the
// derivation rules (data-driven, sourced from config/). No GrokBot is
// created by loading this; it only produces definitions + status.
/** Turn 'ChiefOfStaff' -> 'Chief of Staff' (reusable, no prose). */
export const titleize = (name) => {
    const STOP = new Set(['of', 'to', 'in', 'by', 'at', 'the', 'and']);
    const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/\s+/);
    return words
        .map((w, i) => {
        if (w.length === 1)
            return w.toUpperCase(); // acronym letter (e.g. CIO)
        if (i === 0)
            return w[0].toUpperCase() + w.slice(1);
        if (STOP.has(w.toLowerCase()))
            return w.toLowerCase();
        return w[0].toUpperCase() + w.slice(1);
    })
        .join(' ');
};
export const DOMAINS = [
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
export const SECTION_BY_TIER = {
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
export const ANCHOR_IDS = ['human', 'agentos', 'orgos'];
export const isActivation = (v) => ['core', 'warm', 'ondemand', 'dormant', 'experimental'].includes(v);
export const isPriority = (v) => ['core', 'high', 'advanced', 'experimental'].includes(v);
export const isTier = (v) => DOMAINS.includes(v);
export const isBudgetClass = (v) => ['tiny', 'small', 'medium', 'large'].includes(v);
export const isDataClass = (v) => ['public', 'internal', 'confidential', 'highly_sensitive'].includes(v);
export const isApprovalBoundary = (v) => ['information', 'internal_write', 'human_approval'].includes(v);
//# sourceMappingURL=schema.js.map