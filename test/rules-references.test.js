import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { referenceRules } from '../src/rules/references.js';
import { makeSkill, tempDir, writeFile, writeSkill } from './helpers.js';

const FRONTMATTER = {
  name: 'ref-skill',
  description: 'Checks references. Use when testing references.',
};

/**
 * @param {import('node:test').TestContext} t
 * @param {string} body
 * @returns {{skill: import('../src/types.js').Skill, dir: string}}
 */
function setup(t, body) {
  const root = tempDir(t);
  const dir = path.join(root, 'ref-skill');
  const filePath = writeSkill(dir, { frontmatter: FRONTMATTER, body });
  const skill = makeSkill({
    dir,
    dirName: 'ref-skill',
    filePath,
    data: FRONTMATTER,
    body,
  });
  return { skill, dir };
}

/**
 * @param {string} id
 * @param {import('../src/types.js').Skill} skill
 * @returns {import('../src/types.js').RuleFinding[]}
 */
function run(id, skill) {
  const rule = referenceRules.find((entry) => entry.id === id);
  assert.ok(rule, `missing rule ${id}`);
  return rule.check({ skill }) ?? [];
}

test('every reference rule has a unique id and valid severity', () => {
  const ids = new Set();
  for (const rule of referenceRules) {
    assert.equal(ids.has(rule.id), false);
    ids.add(rule.id);
    assert.ok(['error', 'warning', 'info'].includes(rule.defaultSeverity));
  }
});

test('reference rules stay quiet when frontmatter failed', (t) => {
  const { skill } = setup(t, 'See [missing](missing.md).');
  skill.frontmatterError = { code: 'invalid', message: 'bad', line: 2 };
  for (const rule of referenceRules) {
    assert.deepEqual(rule.check({ skill }), [], rule.id);
  }
});

test('broken-reference reports missing local files at the right line', (t) => {
  const { skill } = setup(t, '# Skill\n\nSee [missing](reference/missing.md).\n');
  const findings = run('broken-reference', skill);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /reference\/missing\.md/);
  assert.equal(findings[0].line, 7);
});

test('broken-reference accepts existing files and skips non-file targets', (t) => {
  const { skill, dir } = setup(t, [
    '# Skill',
    '',
    '[guide](reference/guide.md)',
    '[section](reference/guide.md#usage)',
    '[external](https://example.com/missing.md)',
    '[anchor](#local)',
    '[template](${FILE})',
    '[absolute](/etc/passwd)',
    '[mail](mailto:test@example.com)',
    '',
    '```md',
    '[fenced](missing.md)',
    '```',
    '',
  ].join('\n'));
  writeFile(dir, 'reference/guide.md', '# Guide\n');
  assert.deepEqual(run('broken-reference', skill), []);
});

test('broken-reference decodes URL-encoded paths', (t) => {
  const { skill, dir } = setup(t, '# Skill\n\n[guide](reference/my%20guide.md)\n');
  writeFile(dir, 'reference/my guide.md', '# Guide\n');
  assert.deepEqual(run('broken-reference', skill), []);
});

test('broken-reference reports a target only once', (t) => {
  const { skill } = setup(t, '# Skill\n\n[one](missing.md)\n[two](missing.md)\n');
  assert.equal(run('broken-reference', skill).length, 1);
});

test('nested-reference warns when a reference links to another reference', (t) => {
  const { skill, dir } = setup(t, '# Skill\n\n[advanced](reference/advanced.md)\n');
  writeFile(dir, 'reference/advanced.md', '# Advanced\n\nSee [details](details.md).\n');
  writeFile(dir, 'reference/details.md', '# Details\n');
  const findings = run('nested-reference', skill);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /reference\/advanced\.md/);
  assert.match(findings[0].message, /details\.md/);
  assert.equal(findings[0].line, 7);
});

test('nested-reference ignores links back to SKILL.md and fenced examples', (t) => {
  const { skill, dir } = setup(t, '# Skill\n\n[advanced](reference/advanced.md)\n');
  writeFile(dir, 'reference/advanced.md', [
    '# Advanced',
    '',
    '[back](../SKILL.md)',
    '[external](https://example.com/x.md)',
    '',
    '```md',
    '[nested](details.md)',
    '```',
    '',
  ].join('\n'));
  writeFile(dir, 'reference/details.md', '# Details\n');
  assert.deepEqual(run('nested-reference', skill), []);
});

test('nested-reference emits one finding per reference file', (t) => {
  const { skill, dir } = setup(t, '# Skill\n\n[a](reference/a.md)\n[b](reference/b.md)\n');
  writeFile(dir, 'reference/a.md', '[one](one.md)\n[two](two.md)\n');
  writeFile(dir, 'reference/b.md', '[three](three.md)\n');
  writeFile(dir, 'reference/one.md', '# One\n');
  writeFile(dir, 'reference/two.md', '# Two\n');
  writeFile(dir, 'reference/three.md', '# Three\n');
  assert.equal(run('nested-reference', skill).length, 2);
});

test('reference-toc asks for contents on long references', (t) => {
  const { skill, dir } = setup(t, '# Skill\n\n[long](reference/long.md)\n');
  writeFile(dir, 'reference/long.md', `${'line\n'.repeat(120)}`);
  const findings = run('reference-toc', skill);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 7);
  assert.match(findings[0].message, /over 100 lines/);
});

test('reference-toc accepts a contents heading and short references', (t) => {
  const { skill, dir } = setup(t, '# Skill\n\n[long](reference/long.md)\n[short](reference/short.md)\n');
  writeFile(dir, 'reference/long.md', `# Long\n\n## Contents\n\n${'line\n'.repeat(120)}`);
  writeFile(dir, 'reference/short.md', '# Short\n\nText.\n');
  assert.deepEqual(run('reference-toc', skill), []);
});

test('orphan-resource finds unreferenced files with their path', (t) => {
  const { skill, dir } = setup(t, '# Skill\n\nRun the workflow.\n');
  writeFile(dir, 'scripts/run.py', 'print("hi")\n');
  const findings = run('orphan-resource', skill);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, path.join(dir, 'scripts', 'run.py'));
  assert.equal(findings[0].line, 1);
  assert.match(findings[0].message, /scripts\/run\.py/);
});

test('orphan-resource accepts relative and basename mentions', (t) => {
  const { skill, dir } = setup(t, '# Skill\n\nRun `scripts/run.py`.\n');
  writeFile(dir, 'scripts/run.py', 'print("hi")\n');
  assert.deepEqual(run('orphan-resource', skill), []);

  const second = setup(t, '# Skill\n\nRun `run.py`.\n');
  writeFile(second.dir, 'scripts/run.py', 'print("hi")\n');
  assert.deepEqual(run('orphan-resource', second.skill), []);
});

test('orphan-resource skips docs, hidden files, and SKILL.md', (t) => {
  const { skill, dir } = setup(t, '# Skill\n\nBody.\n');
  writeFile(dir, 'README.md', '# Readme\n');
  writeFile(dir, 'LICENSE', 'MIT\n');
  writeFile(dir, 'CHANGELOG.md', '# Changes\n');
  writeFile(dir, '.hidden.md', '# Hidden\n');
  writeFile(dir, 'nested/SKILL.md', '# Nested\n');
  assert.deepEqual(run('orphan-resource', skill), []);
});

test('orphan-resource caps findings at ten', (t) => {
  const { skill, dir } = setup(t, '# Skill\n\nBody.\n');
  for (let index = 0; index < 12; index += 1) {
    writeFile(dir, `scripts/file-${index}.py`, 'print(1)\n');
  }
  assert.equal(run('orphan-resource', skill).length, 10);
});
