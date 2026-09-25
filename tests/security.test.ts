import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadWorkforce } from '../src/registry.js';
import { compileRole } from '../src/compiler.js';

const w = loadWorkforce();
const roleByName = (name: string) => [...w.roles.values()].find((r) => r.name === name)!;

describe('security: high-sensitivity enforcement', () => {
  it('highly_sensitive_roles list is fully resolved and flagged', () => {
    const names = w.security.highly_sensitive_roles ?? [];
    assert.ok(names.length >= 9, `expected a meaningful list, got ${names.length}`);
    for (const name of names) {
      const r = roleByName(name);
      assert.ok(r, `unknown role ${name} in highly_sensitive_roles`);
      assert.equal(r.highlySensitive, true, `${name} not flagged`);
      assert.equal(r.dataClass, 'highly_sensitive', `${name} dataClass`);
    }
  });

  it('Controller and TreasuryManager are highly_sensitive + human_approval', () => {
    for (const name of ['Controller', 'TreasuryManager']) {
      const r = roleByName(name);
      assert.equal(r.dataClass, 'highly_sensitive', name);
      assert.equal(r.approvalBoundary, 'human_approval', name);
    }
  });

  it('compiled prompt appends SENSITIVE clause and stays within 4 lines', () => {
    for (const name of w.security.highly_sensitive_roles ?? []) {
      const r = roleByName(name);
      const c = compileRole(w, r.id)!;
      assert.match(c.prompt, /SENSITIVE:/, name);
      assert.ok(c.prompt.split('\n').length <= 4, `${name}: ${c.prompt.split('\n').length} lines`);
    }
  });

  it('non-sensitive roles do NOT get the SENSITIVE clause', () => {
    const r = roleByName('DeepResearcher');
    if (r) {
      const c = compileRole(w, r.id)!;
      assert.ok(!c.prompt.includes('SENSITIVE:'), 'DeepResearcher must not carry SENSITIVE clause');
      assert.equal(r.highlySensitive, false);
    }
  });

  it('kernel embeds the no-secrets + recheck-facts guard', () => {
    assert.match(w.kernel, /No secrets in conversations/i);
    assert.match(w.kernel, /recheck consequential current facts/i);
  });

  it('no_autonomous + privileged actions are declared', () => {
    for (const a of ['money_movement', 'purchases', 'legal_filing_signature', 'irreversible_account_security_change']) {
      assert.ok(w.security.no_autonomous.includes(a), a);
    }
    assert.ok(w.security.privileged_actions_require_approval.includes('creating_or_deleting_bots'));
  });

  it('family-office sensitive roles all have overrides', () => {
    for (const name of ['FamilyCFO', 'TaxCoordinator', 'LegalCoordinator', 'EstateTrustCoordinator', 'InsuranceRiskManager', 'FamilyOfficeDataRoom', 'SecurityCoordinator']) {
      assert.equal(roleByName(name).dataClass, 'highly_sensitive', name);
    }
  });
});