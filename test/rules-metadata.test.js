import test from 'node:test';
import assert from 'node:assert/strict';
import { metadataRules } from '../src/rules/metadata.js';
import { makeSkill } from './helpers.js';

/**
 * @param {string} id
 * @param {Parameters<typeof makeSkill>[0]} overrides
 * @returns {import('../src/types.js').RuleFinding[]}
 */
function run(id, overrides) {
  const rule = metadataRules.find((entry) => entry.id === id);
  assert.ok(rule, `missing rule ${id}`);
  return rule.check({ skill: makeSkill(overrides) }) ?? [];
}

test('every metadata rule has a unique id and valid severity', () => {
  const ids = new Set();
  for (const rule of metadataRules) {
    assert.equal(ids.has(rule.id), false, `duplicate id ${rule.id}`);
    ids.add(rule.id);
    assert.match(rule.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(['error', 'warning', 'info'].includes(rule.defaultSeverity));
    assert.equal(typeof rule.title, 'string');
    assert.equal(typeof rule.description, 'string');
  }
});

test('the default good skill has no metadata findings', () => {
  const skill = makeSkill();
  const findings = metadataRules.flatMap((rule) => rule.check({ skill }) ?? []);
  assert.deepEqual(findings, []);
});

test('all metadata rules return nothing when frontmatter failed', () => {
  const skill = makeSkill({
    data: { name: 'Bad Name', description: '' },
    frontmatterError: { code: 'invalid', message: 'bad', line: 2 },
  });
  for (const rule of metadataRules) {
    assert.deepEqual(rule.check({ skill }), [], rule.id);
  }
});

test('unknown fields are reported at their line', () => {
  const findings = run('frontmatter-unknown-field', {
    data: { name: 'test-skill', description: 'Does a thing. Use when asked.', typo_field: true },
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /typo_field/);
  assert.equal(findings[0].line, 4);
});

test('known optional fields are not unknown', () => {
  const findings = run('frontmatter-unknown-field', {
    data: {
      name: 'test-skill',
      description: 'Does a thing. Use when asked.',
      'allowed-tools': ['Read'],
      'argument-hint': '[file]',
      context: 'fork',
      agent: 'general-purpose',
      effort: 'high',
      metadata: { owner: 'me' },
      license: 'MIT',
      compatibility: 'Claude Code',
    },
  });
  assert.deepEqual(findings, []);
});

test('field-type catches bad primitive types', () => {
  const cases = [
    [{ description: 42 }, /description.*string/],
    [{ name: 42 }, /name.*string/],
    [{ background: 'sometimes' }, /background.*boolean/],
    [{ 'allowed-tools': ['Read', 3] }, /allowed-tools.*array of strings/],
    [{ metadata: ['nope'] }, /metadata.*mapping/],
    [{ paths: { a: 1 } }, /paths.*string or an array/],
  ];

  for (const [data, pattern] of cases) {
    const findings = run('field-type', { data });
    assert.ok(findings.some((finding) => pattern.test(finding.message)), JSON.stringify(data));
  }
});

test('field-type accepts boolean variants and string lists', () => {
  const data = {
    name: 'test-skill',
    description: 'Does a thing. Use when asked.',
    'disable-model-invocation': 'YES',
    'user-invocable': 0,
    background: 'off',
    'allowed-tools': 'Read, Grep',
    arguments: ['one', 'two'],
    paths: '**/*.ts',
    hooks: {},
  };
  assert.deepEqual(run('field-type', { data }), []);
});

test('field-type validates context, effort, and compatibility', () => {
  assert.equal(run('field-type', { data: { ...makeSkill().data, context: 'inline' } }).length, 1);
  assert.equal(run('field-type', { data: { ...makeSkill().data, effort: 'extreme' } }).length, 1);
  assert.equal(run('field-type', { data: { ...makeSkill().data, compatibility: 'x'.repeat(501) } }).length, 1);
  assert.deepEqual(run('field-type', { data: { ...makeSkill().data, context: 'fork', effort: 'max', compatibility: 'x'.repeat(500) } }), []);
});

test('fork-fields warns for agent without context or fork', () => {
  const findings = run('fork-fields', { data: { ...makeSkill().data, agent: 'general-purpose' } });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 4);
  assert.deepEqual(run('fork-fields', { data: { ...makeSkill().data, context: 'fork', agent: 'general-purpose' } }), []);
});

test('name-required catches missing and empty names', () => {
  const data = { description: 'Does a thing. Use when asked.' };
  assert.equal(run('name-required', { data }).length, 1);
  assert.equal(run('name-required', { data: { ...data, name: '  ' } }).length, 1);
  assert.equal(run('name-required', { data: { ...data, name: 4 } }).length, 0);
});

test('name-format enforces length, characters, and hyphens', () => {
  const base = makeSkill().data;
  assert.match(run('name-format', { data: { ...base, name: 'a'.repeat(65) } })[0].message, /maximum is 64/);
  assert.match(run('name-format', { data: { ...base, name: 'Bad Name' } })[0].message, /not valid/);
  assert.match(run('name-format', { data: { ...base, name: '-bad' } })[0].hint, /leading, trailing/);
  assert.match(run('name-format', { data: { ...base, name: 'bad--name' } })[0].hint, /consecutive/);
  assert.deepEqual(run('name-format', { data: { ...base, name: 'good-skill-2' } }), []);
});

test('name-reserved warns only for complete reserved words', () => {
  const base = makeSkill().data;
  assert.equal(run('name-reserved', { data: { ...base, name: 'claude-helper' } }).length, 1);
  assert.equal(run('name-reserved', { data: { ...base, name: 'anthropic-tools' } }).length, 1);
  assert.deepEqual(run('name-reserved', { data: { ...base, name: 'claudette-helper' } }), []);
});

test('name-directory compares the name with the parent folder', () => {
  assert.equal(run('name-directory', {
    dirName: 'other-dir',
    data: { ...makeSkill().data, name: 'test-skill' },
  }).length, 1);
  assert.deepEqual(run('name-directory', {}), []);
});

test('description-required catches missing and empty descriptions', () => {
  assert.equal(run('description-required', { data: { name: 'test-skill' } }).length, 1);
  assert.equal(run('description-required', { data: { name: 'test-skill', description: '   ' } }).length, 1);
  assert.equal(run('description-required', { data: { name: 'test-skill', description: 42 } }).length, 0);
});

test('description-length enforces the 1,024-character cap', () => {
  const base = makeSkill().data;
  assert.equal(run('description-length', { data: { ...base, description: 'x'.repeat(1025) } }).length, 1);
  assert.deepEqual(run('description-length', { data: { ...base, description: 'x'.repeat(1024) } }), []);
});

test('description-truncation uses the combined listing length', () => {
  const data = {
    name: 'test-skill',
    description: 'Does a thing. Use when asked.',
    when_to_use: `x${'y'.repeat(1535)}`,
  };
  const findings = run('description-truncation', { data });
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /1,536/);
});

test('description-trigger accepts common when-to-use phrasing', () => {
  const base = { name: 'test-skill' };
  assert.equal(run('description-trigger', { data: { ...base, description: 'Processes files.' } }).length, 1);
  assert.deepEqual(run('description-trigger', { data: { ...base, description: 'Processes files. Use when the user asks for a report.' } }), []);
  assert.deepEqual(run('description-trigger', { data: { ...base, description: 'Processes files.', when_to_use: 'Invoke when working with CSV files.' } }), []);
});

test('description-third-person catches first and second person', () => {
  const base = { name: 'test-skill' };
  assert.equal(run('description-third-person', { data: { ...base, description: 'I can process files. Use when asked.' } }).length, 1);
  assert.equal(run('description-third-person', { data: { ...base, description: 'You can process files. Use when asked.' } }).length, 1);
  assert.deepEqual(run('description-third-person', { data: { ...base, description: 'Processes files. Use when asked.' } }), []);
});

test('description-xml warns about angle-bracket tags', () => {
  const base = { name: 'test-skill' };
  assert.equal(run('description-xml', { data: { ...base, description: 'Reads <filename>. Use when asked.' } }).length, 1);
  assert.deepEqual(run('description-xml', { data: { ...base, description: 'Reads `filename`. Use when asked.' } }), []);
});

test('reserved-directory rejects synced and anthropic-skills', () => {
  assert.equal(run('reserved-directory', { dirName: 'synced' }).length, 1);
  assert.equal(run('reserved-directory', { dirName: 'Anthropic-Skills' }).length, 1);
  assert.deepEqual(run('reserved-directory', { dirName: 'my-skills' }), []);
});
