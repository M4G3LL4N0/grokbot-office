#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const defaultRoot = join(scriptRoot, '..');
const publicDirectories = new Set(['.github', 'config', 'examples', 'registry', 'scripts', 'src', 'tests']);
const excludedDirectories = new Set([
  '.git',
  '.pnpm-store',
  '_harvest_export',
  'autonomy',
  'coverage',
  'dist',
  'docs',
  'generated',
  'node_modules',
  'runtime',
  'state',
]);
const excludedName = /(?:^|[\\/])(?:cookies?|sessions?|tokens?|keys?|credentials?)(?:[./_-]|$)/i;
const excludedArchive = /\.(?:7z|bak|gz|log|p12|pfx|pem|rar|sqlite|tar|tmp|zip)$/i;
const textExtensions = new Set(['.css', '.csv', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.tsv', '.txt', '.yaml', '.yml']);
const textNames = new Set(['.gitignore', 'code_of_conduct.md', 'license', 'publishing_audit.md']);

const pathTail = '[^\\s"\\' + '`]';
const privatePathPatterns = [
  new RegExp(['/Us', 'ers/'].join('') + pathTail, 'i'),
  new RegExp(['/ho', 'me/'].join('') + pathTail, 'i'),
  new RegExp(['~', '/'].join('') + pathTail, 'i'),
  new RegExp(['[A', ']:\\\\Users\\\\'].join('') + pathTail, 'i'),
  new RegExp(['127.', '0.0.1:'].join('') + '\\d+', 'i'),
  new RegExp(['localhost', ':'].join('') + '\\d+', 'i'),
];
const urlPattern = new RegExp(`${['https?', '://'].join('')}`, 'i');
const approvedExternalUrl = /^https:\/\/github\.com\/M4G3LL4N0\/(?:agentos|grokbot-office|grokbot-office-website)(?:[/#?.=&A-Za-z0-9._~%+:-]*)?$/i;
const urlsInLine = (line) => line.match(/https?:\/\/[^\s"'`)>]+/gi) ?? [];
const secretPatterns = [
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['provider credential', /\b(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|crsr_[A-Za-z0-9]{20,}|(?:sk|rk)_live_[A-Za-z0-9]{20,})\b/],
  ['assigned credential', /\b(?:api[_-]?key|secret|password|passwd|access[_-]?token|refresh[_-]?token|authorization)\s*[:=]\s*["']?(?!\$\{|process\.env|<|your_|example|placeholder)[A-Za-z0-9_./+-]{12,}/i],
  ['bearer credential', /Authorization\s*:\s*Bearer\s+(?!\$\{|process\.env|<|example|placeholder)[A-Za-z0-9._-]{12,}/i],
];
const accountPatterns = [
  ['account identifier', /\b(?:account|customer|client|user)[_-]?id\s*[:=]\s*["']?[A-Za-z0-9_-]{6,}/i],
  ['payment value', /(?:[$€£]\s*\d[\d,.]*\d|\b(?:USD|EUR|GBP)\s*\d[\d,.]*\d)/i],
  ['payment instrument', /\b(?:card|iban|routing|account)[-_ ]?(?:number|value)\s*[:=]/i],
];
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

const normalize = (value) => value.split(sep).join('/');
const isExcluded = (relativePath) => {
  const segments = normalize(relativePath).split('/');
  return segments.some((segment) => excludedDirectories.has(segment)) || excludedName.test(relativePath) || excludedArchive.test(relativePath);
};
const isText = (relativePath) => {
  const name = normalize(relativePath).split('/').at(-1) ?? '';
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot).toLowerCase() : '';
  return textExtensions.has(extension) || textNames.has(name.toLowerCase());
};

const collect = (root) => {
  const publicFiles = [];
  let excluded = 0;
  const visit = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const rel = normalize(relative(root, absolute));
      if (isExcluded(rel)) {
        excluded += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (directory === root && !publicDirectories.has(entry.name)) {
          excluded += 1;
          continue;
        }
        visit(absolute);
        continue;
      }
      if (!entry.isFile()) {
        excluded += 1;
        continue;
      }
      publicFiles.push(rel);
    }
  };
  visit(root);
  return { publicFiles: publicFiles.sort(), excluded };
};

const addMatches = (issues, file, lineNumber, line, patterns) => {
  for (const [kind, pattern] of patterns) {
    if (pattern.test(line)) issues.push({ file, line: lineNumber, kind });
  }
};

const scanFile = (root, file) => {
  const issues = [];
  let content;
  try {
    content = readFileSync(join(root, file), 'utf8');
  } catch {
    return [{ file, line: 1, kind: 'unreadable public file' }];
  }
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    addMatches(issues, file, lineNumber, line, privatePathPatterns.map((pattern) => ['private path', pattern]));
    if (urlPattern.test(line) && urlsInLine(line).some((url) => !approvedExternalUrl.test(url))) {
      issues.push({ file, line: lineNumber, kind: 'external URL' });
    }
    addMatches(issues, file, lineNumber, line, secretPatterns);
    addMatches(issues, file, lineNumber, line, accountPatterns);
    if (emailPattern.test(line)) issues.push({ file, line: lineNumber, kind: 'contact identifier' });
  }
  return issues;
};

const validateExamples = (root, files) => {
  const issues = [];
  const examples = files.filter((file) => file.startsWith('examples/'));
  for (const file of examples) {
    let content = '';
    try {
      content = readFileSync(join(root, file), 'utf8');
    } catch {
      issues.push({ file, line: 1, kind: 'unreadable example' });
      continue;
    }
    if (!/synthetic\s*:\s*true/i.test(content) || !/simulation\s*:\s*true/i.test(content)) {
      issues.push({ file, line: 1, kind: 'example is not marked synthetic and simulation' });
    }
  }
  return { examples: examples.length, issues };
};

const rootArgument = () => {
  const index = process.argv.indexOf('--root');
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : defaultRoot;
};

const root = rootArgument();
if (!existsSync(root) || !statSync(root).isDirectory()) {
  process.stdout.write('Publication validation: FAIL\n- root is not a readable directory\n');
  process.exit(1);
}

const { publicFiles, excluded } = collect(root);
const issues = [];
for (const file of publicFiles) {
  if (isText(file)) issues.push(...scanFile(root, file));
}
const exampleResult = validateExamples(root, publicFiles);
issues.push(...exampleResult.issues);

if (issues.length > 0) {
  process.stdout.write('Publication validation: FAIL\n');
  for (const issue of issues) process.stdout.write(`- ${issue.file}:${issue.line}: ${issue.kind}\n`);
  process.exit(1);
}

process.stdout.write('Publication validation: PASS\n');
process.stdout.write(`Public candidate files checked: ${publicFiles.length}\n`);
process.stdout.write(`Quarantined paths excluded: ${excluded}\n`);
process.stdout.write(`Synthetic examples checked: ${exampleResult.examples}\n`);
