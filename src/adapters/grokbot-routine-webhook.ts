// GrokBot Office — webhook adapter for the Cursor GrokBot "routine" Webhook
// trigger. Officially supported (verified: cursor docs — helproom/...grok-bot
// routines webhook).
//
// Concrete verified contract:
//   - Routine trigger fields: "POST to" URL + key (crsr_…)
//   - Every call: Authorization: Bearer <key>
//   - HTTP 200 + body.success:true  => accepted; run started by GrokBot that
//     moment, with a runUuid returned. This is ACCEPTANCE, NOT COMPLETION.
//     Result arrives later; check Run history / the conversation for it.
//   - HTTP 400 => the routine didn't start (disabled routine or bad key).
//   - This adapter therefore tracks states:
//       not_configured -> submitted -> accepted (-) or failed
//     and NEVER auto-marks "completed".
//
// SECURITY: keys live only in the environment (GROKBOT_<ROLE>_WEBHOOK_KEY),
// never in files, never logged, never surfaced by `grok webhook status`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from '../paths.js';

export type WebhookState = 'not_configured' | 'submitted' | 'accepted' | 'failed';

export interface WebhookEvent {
  state: WebhookState;
  runUuid?: string;
  error?: string;
  lastAt?: string;
}

export type WebhookTracker = Record<string, WebhookEvent>;

export const trackerPath = (root = ROOT): string => join(root, 'state', 'webhook-tracker.json');

export function readTracker(root = ROOT): WebhookTracker {
  const p = trackerPath(root);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as WebhookTracker;
  } catch {
    return {};
  }
}

export function writeEvent(root: string, roleName: string, ev: WebhookEvent): void {
  const tracker = readTracker(root);
  tracker[(roleName ?? '').toUpperCase()] = ev;
  const p = trackerPath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(tracker, null, 2) + '\n');
}

const envKey = (roleName: string): string => `GROKBOT_${roleName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

export interface WebhookConfig {
  configured: boolean;
  url: string | null;
  /** human confirmation only — the adapter NEVER prints the key */
  keyPresent: boolean;
}

export function webhookConfigFor(roleName: string): WebhookConfig {
  const url = process.env[`${envKey(roleName)}_WEBHOOK_URL`] ?? null;
  const key = process.env[`${envKey(roleName)}_WEBHOOK_KEY`] ?? null;
  return { configured: Boolean(url && key), url, keyPresent: Boolean(key) };
}

export interface SubmitResult {
  roleName: string;
  state: WebhookState;
  runUuid: string | null;
  error: string | null;
  accepted: boolean;
}

/**
 * POST one task to a configured webhook routine. Requires human approval and
 * an actively enabled routine; NEVER called by any automatic path.
 */
export async function submitToRoutine(
  roleName: string,
  input: unknown,
  root = ROOT,
): Promise<SubmitResult> {
  const cfg = webhookConfigFor(roleName);
  if (!cfg.configured) {
    const ev: WebhookEvent = { state: 'not_configured', error: 'URL and/or key not set in env', lastAt: new Date().toISOString() };
    writeEvent(root, roleName, ev);
    return { roleName, state: 'not_configured', runUuid: null, error: ev.error ?? null, accepted: false };
  }
  if (!cfg.keyPresent) {
    const ev: WebhookEvent = { state: 'not_configured', error: 'key missing', lastAt: new Date().toISOString() };
    writeEvent(root, roleName, ev);
    return { roleName, state: 'not_configured', runUuid: null, error: ev.error ?? null, accepted: false };
  }

  let body: unknown;
  let status = 0;
  let httpError: string | null = null;
  try {
    const res = await fetch(cfg.url!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env[`${envKey(roleName)}_WEBHOOK_KEY`]!}`,
      },
      body: JSON.stringify({ input }),
    });
    status = res.status;
    body = await res.json().catch(() => null);
  } catch (err) {
    httpError = err instanceof Error ? err.message : String(err);
  }

  writeEvent(root, roleName, { state: 'submitted', lastAt: new Date().toISOString() });

  const ok = resWasAccepted(status, body);
  const runUuid = (body as { runUuid?: string } | null)?.runUuid ?? null;
  const state: WebhookState = ok ? 'accepted' : 'failed';
  writeEvent(root, roleName, {
    state,
    runUuid: runUuid ?? undefined,
    error: ok ? undefined : httpError ?? `http ${status}; ${describeNotAccepted(body)}`,
    lastAt: new Date().toISOString(),
  });

  return {
    roleName,
    state,
    runUuid,
    error: ok ? null : `http ${status}; call started? NO`,
    accepted: ok,
  };
}

function resWasAccepted(status: number, body: unknown): boolean {
  if (status === 200) {
    const s = (body as { success?: unknown } | null)?.success;
    return s === true || Boolean((body as { runUuid?: unknown } | null)?.runUuid);
  }
  return false;
}

function describeNotAccepted(body: unknown): string {
  const b = body as { code?: string; message?: string } | null;
  if (b?.message) return b.message;
  return 'routine returned non-200 → run did not start';
}

export function statusFor(roleName: string, root = ROOT): WebhookConfig & WebhookEvent {
  const tracker = readTracker(root);
  const ev = tracker[roleName.toUpperCase()] ?? ({ state: 'not_configured' } as WebhookEvent);
  return { ...webhookConfigFor(roleName), ...ev };
}