import test from 'node:test';
import assert from 'node:assert/strict';
import { contentRules } from '../src/rules/content.js';
import { makeSkill } from './helpers.js';

/**
 * @param {string} id
 * @param {string} body
 * @returns {import('../src/types.js').RuleFinding[]}
 */
function run(id, body) {
  const rule = contentRules.find((entry) => entry.id === id);
  assert.ok(rule, `missing rule ${id}`);
  return rule.check({ skill: makeSkill({ body }) }) ?? [];
}

test('every content rule has a unique id and valid severity', () => {
  const ids = new Set();
  for (const rule of contentRules) {
    assert.equal(ids.has(rule.id), false);
    ids.add(rule.id);
    assert.ok(['error', 'warning', 'info'].includes(rule.defaultSeverity));
  }
});

test('the default good body has no content findings', () => {
  const skill = makeSkill();
  const findings = contentRules.flatMap((rule) => rule.check({ skill }) ?? []);
  assert.deepEqual(findings, []);
});

test('content rules stay quiet when frontmatter failed', () => {
  const skill = makeSkill({
    body: 'TODO',
    frontmatterError: { code: 'invalid', message: 'bad', line: 2 },
  });
  for (const rule of contentRules) {
    assert.deepEqual(rule.check({ skill }), [], rule.id);
  }
});

test('body-empty catches whitespace-only bodies', () => {
  assert.equal(run('body-empty', '   \n\n').length, 1);
  assert.deepEqual(run('body-empty', '# Heading\n'), []);
});

test('body-heading suggests a heading', () => {
  assert.equal(run('body-heading', 'Just instructions.\n').length, 1);
  assert.deepEqual(run('body-heading', '## Instructions\n').filter((finding) => finding.message.includes('no Markdown heading')), []);
});

test('body-length warns only above 500 lines', () => {
  const body = (count) => Array.from({ length: count }, (_, index) => `line ${index}`).join('\n');
  assert.equal(run('body-length', body(501)).length, 1);
  assert.deepEqual(run('body-length', body(500)), []);
});

test('body-token-budget warns above 5,000 estimated tokens', () => {
  assert.equal(run('body-token-budget', 'x'.repeat(20001)).length, 1);
  assert.deepEqual(run('body-token-budget', 'x'.repeat(20000)), []);
});

test('windows-path finds backslash paths with extensions', () => {
  const findings = run('windows-path', 'Run `scripts\\helper.py` first.\nAlso see docs\\guide.md.');
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /scripts\\helper\.py/);
  assert.equal(findings[0].line, 5);
  assert.deepEqual(run('windows-path', 'Run `scripts/helper.py` first.'), []);
  assert.deepEqual(run('windows-path', 'Use a regex like \\d+\\s+.'), []);
});

test('windows-path handles absolute drive paths', () => {
  const findings = run('windows-path', 'Open C:\\Users\\me\\notes.md now.');
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /C:\\Users\\me\\notes\.md/);
});

test('unfinished-content reports the first marker', () => {
  const findings = run('unfinished-content', '# Skill\n\nTODO: add tests\nFIXME later\n');
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /TODO/);
  assert.equal(findings[0].line, 7);
  assert.deepEqual(run('unfinished-content', '# Skill\n\nDone.\n'), []);
});
