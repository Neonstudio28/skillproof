import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJson } from '../src/reporters/json.js';
import { formatPretty } from '../src/reporters/pretty.js';
import {
  escapeData,
  escapeProperty,
  formatGithub,
  formatGithubError,
} from '../src/reporters/github.js';

function report(overrides = {}) {
  return {
    toolVersion: '0.1.0',
    cwd: '/repo',
    results: [
      {
        filePath: '/repo/skills/foo/SKILL.md',
        path: 'skills/foo/SKILL.md',
        name: 'foo',
        score: 85,
        grade: 'B',
        summary: { errors: 1, warnings: 0, info: 0 },
        findings: [
          {
            ruleId: 'name-format',
            severity: 'error',
            message: 'Name is not valid.',
            hint: 'Use kebab-case.',
            line: 2,
            file: '/repo/skills/foo/SKILL.md',
          },
        ],
      },
    ],
    summary: { skills: 1, errors: 1, warnings: 0, info: 0, score: 85, grade: 'B' },
    ok: false,
    failureReasons: ['1 error(s)'],
    ...overrides,
  };
}

test('JSON output has the documented shape and relative paths', () => {
  const payload = JSON.parse(formatJson(report()));
  assert.equal(payload.tool, 'skillproof');
  assert.equal(payload.version, '0.1.0');
  assert.equal(payload.ok, false);
  assert.deepEqual(payload.failureReasons, ['1 error(s)']);
  assert.equal(payload.skills[0].path, 'skills/foo/SKILL.md');
  assert.equal(payload.skills[0].findings[0].file, 'skills/foo/SKILL.md');
  assert.equal(payload.skills[0].findings[0].line, 2);
  assert.equal(payload.skills[0].findings[0].hint, 'Use kebab-case.');
  assert.equal(formatJson(report()).endsWith('\n'), true);
});

test('JSON output handles orphan findings outside the skill file', () => {
  const payload = JSON.parse(formatJson(report({
    results: [{
      ...report().results[0],
      findings: [{
        ruleId: 'orphan-resource',
        severity: 'info',
        message: 'Unused.',
        file: '/repo/skills/foo/scripts/run.py',
        line: 1,
      }],
    }],
  })));
  assert.equal(payload.skills[0].findings[0].file, 'skills/foo/scripts/run.py');
  assert.equal(Object.hasOwn(payload.skills[0].findings[0], 'hint'), false);
});

test('pretty output includes scores, findings, and failure reasons', () => {
  const output = formatPretty(report());
  assert.match(output, /SkillProof 0\.1\.0/);
  assert.match(output, /skills\/foo\/SKILL\.md/);
  assert.match(output, /85\/100 B/);
  assert.match(output, /name-format/);
  assert.match(output, /Use kebab-case/);
  assert.match(output, /Failed:/);
  assert.equal(/\u001B\[/.test(output), false);
});

test('pretty output supports color', () => {
  const output = formatPretty(report({ ok: true, failureReasons: [] }), { color: true });
  assert.match(output, /\u001B\[/);
  assert.match(output, /All checks passed/);
});

test('pretty output handles zero skills', () => {
  const output = formatPretty(report({
    results: [],
    summary: { skills: 0, errors: 0, warnings: 0, info: 0, score: 100, grade: 'A' },
    ok: true,
    failureReasons: [],
  }));
  assert.match(output, /No SKILL\.md files found/);
});

test('GitHub workflow command escaping', () => {
  assert.equal(escapeData('a%b\r\nc'), 'a%25b%0D%0Ac');
  assert.equal(escapeProperty('a,b:c%'), 'a%2Cb%3Ac%25');
});

test('GitHub output maps severities and escapes properties', () => {
  const output = formatGithub(report({
    results: [{
      ...report().results[0],
      path: 'skills/a,b/SKILL.md',
      findings: [
        {
          ruleId: 'name-format',
          severity: 'warning',
          message: 'Bad 100% name.',
          hint: 'Use kebab-case.',
          line: 2,
          file: '/repo/skills/a,b/SKILL.md',
        },
      ],
    }],
  }));
  assert.match(output, /^::warning file=skills\/a%2Cb\/SKILL\.md,line=2,title=skillproof\/name-format::Bad 100%25 name\. Hint: Use kebab-case\./m);
  assert.match(output, /^::error title=SkillProof::/m);
});

test('GitHub output emits info findings as notices', () => {
  const output = formatGithub(report({
    results: [{
      ...report().results[0],
      findings: [{ ruleId: 'body-heading', severity: 'info', message: 'No heading.', file: '/repo/skills/foo/SKILL.md' }],
    }],
    summary: { skills: 1, errors: 0, warnings: 0, info: 1, score: 100, grade: 'A' },
    ok: true,
    failureReasons: [],
  }));
  assert.match(output, /^::notice file=skills\/foo\/SKILL\.md,title=skillproof\/body-heading::No heading\./m);
  assert.match(output, /^::notice title=SkillProof::/m);
});

test('GitHub error diagnostics are escaped', () => {
  assert.equal(formatGithubError('bad\nthing%'), '::error title=SkillProof::bad%0Athing%25\n');
});
