import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { webhookConfigFor, statusFor, submitToRoutine, readTracker } from '../src/adapters/grokbot-routine-webhook.js';

const tmp = mkdtempSync(join(tmpdir(), 'grok-webhook-'));

beforeEach(() => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('GROKBOT_TESTROLE_')) delete process.env[k];
  }
});
afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('GROKBOT_TESTROLE_')) delete process.env[k];
  }
});

describe('webhook adapter', () => {
  it('unconfigured role reports not_configured and never prints a key', () => {
    const st = statusFor('ChiefOfStaff');
    assert.equal(st.configured, false);
    assert.equal(st.state, 'not_configured');
    assert.equal('key' in st, false);
  });

  it('reads URL/key from env only (no repo copy)', () => {
    process.env.GROKBOT_TESTROLE_WEBHOOK_URL = 'routine-endpoint';
    process.env.GROKBOT_TESTROLE_WEBHOOK_KEY = 'test-credential-placeholder';
    const c = webhookConfigFor('testrole');
    assert.equal(c.configured, true);
    assert.equal(c.keyPresent, true);
    assert.equal(c.url, 'routine-endpoint');
    // key value must not leak through public surface
    const via = statusFor('testrole');
    assert.equal(via.state, 'not_configured');
    assert.ok(!JSON.stringify(via).includes('test-credential-placeholder'));
  });

  it('submit with no config fails fast without network', async () => {
    const r = await submitToRoutine('ChiefOfStaff', { goal: 'x' }, tmp);
    assert.equal(r.accepted, false);
    assert.equal(r.state, 'not_configured');
    assert.match(r.error ?? '', /env/);
    const tr = readTracker(tmp);
    assert.equal(tr.CHIEFOFSTAFF?.state, 'not_configured');
  });

  it('acceptance is tracked separately from completion (HTTP ok != done)', () => {
    process.env.GROKBOT_TESTROLE_WEBHOOK_URL = 'routine-endpoint';
    process.env.GROKBOT_TESTROLE_WEBHOOK_KEY = 'test-credential-placeholder';
    const c = webhookConfigFor('testrole');
    assert.equal(c.configured, true);
    const st = statusFor('testrole');
    // only configured in env; no event ever says completed
    assert.equal(st.state, 'not_configured');
  });
});