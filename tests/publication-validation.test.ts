import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(process.cwd(), 'scripts', 'validate-publication.mjs');

const run = (root: string): { status: number; output: string } => {
  try {
    const output = execFileSync(process.execPath, [script, '--root', root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
};

const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'grokbot-publication-'));
  mkdirSync(join(root, 'examples'), { recursive: true });
  writeFileSync(join(root, 'README.md'), 'GrokBot Office\n');
  return root;
};

describe('publication validation', () => {
  it('rejects a private path without echoing its value', () => {
    const root = fixture();
    try {
      writeFileSync(join(root, 'examples', 'leak.md'), `source: ${['/Us', 'ers/example/private/report'].join('')}\n`);
      const result = run(root);
      assert.notEqual(result.status, 0);
      assert.match(result.output, /private path/i);
      assert.doesNotMatch(result.output, /private\/report/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts synthetic examples while excluding quarantined material', () => {
    const root = fixture();
    try {
      writeFileSync(join(root, 'examples', 'safe.md'), 'synthetic: true\nsimulation: true\n');
      mkdirSync(join(root, '_harvest_export'), { recursive: true });
      writeFileSync(join(root, '_harvest_export', 'private.txt'), 'synthetic private marker\n');
      const result = run(root);
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /public candidate files/i);
      assert.doesNotMatch(result.output, /private marker/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
