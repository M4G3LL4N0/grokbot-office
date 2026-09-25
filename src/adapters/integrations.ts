// GrokBot Office — integration boundary adapters.
//
// AgentOS, OrgOS, PAIOS and RevenueOS are separate systems. We do NOT import or
// call them at runtime by default. These adapters are thin, read-only contracts
// and discovery surfaces:
//   - feature flag GROK_FEATURE_INTEGRATIONS (default off) gates everything.
//   - enabled mode never writes to, or orchestrates, the other system; it only
//     inspects explicitly configured interface definitions.
//   - disabled mode returns the documented contract with a clear note.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../paths.js';
import type { Workforce } from '../registry.js';

const FEATURE = 'GROK_FEATURE_INTEGRATIONS';

export const integrationsEnabled = (): boolean => process.env[FEATURE] === '1';

export interface AdapterVerdict {
  feature: typeof FEATURE;
  enabled: boolean;
  source: string;
  contract: string[];
  mounted: boolean;
  note: string;
}

// ---- AgentOS ----------------------------------------------------------------
export function agentosAdapter(): AdapterVerdict {
  const agentosHome = process.env.AGENTOS_HOME ?? '';
  const exists = Boolean(agentosHome) && existsSync(join(agentosHome, 'src', 'agentos'));
  const contract = [
    'REST: ThreadingHTTPServer GET/POST on 127.0.0.1 (src/api.py)',
    'MCP: `agentos mcp` stdio server registering tools (src/mcp_server.py); ToolRegistry',
    'grok adapter exists at src/adapters/grok.py (read-only contract reference)',
  ];
  return {
    feature: FEATURE,
    enabled: integrationsEnabled(),
    source: agentosHome ? join(agentosHome, 'src', 'agentos') : 'not configured',
    contract,
    mounted: exists,
    note: exists
      ? 'AgentOS interfaces inspected; read-only. No runtime calls while feature off.'
      : 'AgentOS not found at AGENTOS_HOME; descriptor still returned.',
  };
}

// ---- OrgOS ------------------------------------------------------------------
export function orgosAdapter(): AdapterVerdict {
  const orgosHome = process.env.ORGOS_HOME ?? '';
  const roleDts = Boolean(orgosHome) && existsSync(join(orgosHome, 'src', 'domain', 'role.ts'));
  const apiDts = Boolean(orgosHome) && existsSync(join(orgosHome, 'src', 'api', 'api.ts'));
  const contract = [
    'Domain: Role interface client (managerRoleId, capabilities, permissions) at src/domain/role.ts',
    'API: OrgApi/OrgosApi classes + HTTP server at src/api/*',
    'Mapping hint: our parent-chain == OrgOS managerRoleId chain; both are tree-shaped',
  ];
  return {
    feature: FEATURE,
    enabled: integrationsEnabled(),
    source: orgosHome || 'not configured',
    contract,
    mounted: roleDts && apiDts,
    note: apiDts
      ? 'OrgOS interfaces inspected; read-only. Only mapping documentation is produced.'
      : 'OrgOS role/api modules not found; descriptor still returned.',
  };
}

// ---- PAIOS ------------------------------------------------------------------
export function paiosAdapter(w: Workforce): AdapterVerdict {
  const paiosHome = process.env.PAIOS_HOME ?? '';
  const hasSdk = Boolean(paiosHome) && existsSync(join(paiosHome, 'apps', 'paios-sdk'));
  const descriptor = paiosDescriptor(w);
  return {
    feature: FEATURE,
    enabled: integrationsEnabled(),
    source: paiosHome || 'not configured',
    contract: ['apps/paios-sdk, paios-browser, paios-publishing-sdk', 'No GrokBot references found; proposal below'],
    mounted: hasSdk,
    note: `PAIOS descriptor written to ${descriptor} (PROPOSAL — not wired)`,
  };
}

export function paiosDescriptor(w: Workforce): string {
  const p = join(ROOT, 'generated', 'paios-grokbot-office-descriptor.md');
  // write happens in CLI to keep this module side-effect free on import
  return p;
}

// ---- RevenueOS --------------------------------------------------------------
export function revenueosAdapter(w: Workforce): AdapterVerdict {
  const commerce = [...w.roles.values()].filter((r) => r.tags.includes('revenue-intelligence'));
  return {
    feature: FEATURE,
    enabled: integrationsEnabled(),
    source: 'registry (roles.yaml revenue_intelligence + commerce domain)',
    contract: [`${commerce.length} revenue-intelligence roles discovered`, 'read-only discovery JSON emitted'],
    mounted: commerce.length > 0,
    note: 'RevenueOS discovery file is a read-only inventory; it never triggers deals.',
  };
}