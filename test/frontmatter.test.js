import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, parseSkill } from '../src/frontmatter.js';

const FILE = '/tmp/my-skill/SKILL.md';

test('parses normal frontmatter and body', () => {
  const raw = '---\nname: my-skill\ndescription: Does a thing.\n---\n# Body\n\nHello\n';
  const skill = parseSkill(raw, FILE);

  assert.equal(skill.filePath, FILE);
  assert.equal(skill.dir, '/tmp/my-skill');
  assert.equal(skill.dirName, 'my-skill');
  assert.equal(skill.name, 'my-skill');
  assert.deepEqual(skill.data, { name: 'my-skill', description: 'Does a thing.' });
  assert.equal(skill.frontmatterError, null);
  assert.equal(skill.body, '# Body\n\nHello\n');
  assert.equal(skill.bodyStartLine, 5);
  assert.equal(skill.frontmatterStartLine, 2);
  assert.equal(skill.frontmatterEndLine, 4);
  assert.equal(skill.frontmatterRaw, 'name: my-skill\ndescription: Does a thing.');
});

test('missing frontmatter is an error but keeps the raw body', () => {
  const raw = '# Just markdown\n';
  const skill = parseSkill(raw, FILE);

  assert.equal(skill.frontmatterError.code, 'missing');
  assert.equal(skill.frontmatterError.line, 1);
  assert.equal(skill.body, raw);
  assert.equal(skill.bodyStartLine, 1);
  assert.deepEqual(skill.data, {});
  assert.equal(skill.name, 'my-skill');
});

test('empty frontmatter is valid', () => {
  const skill = parseSkill('---\n---\n# Body\n', FILE);

  assert.equal(skill.frontmatterError, null);
  assert.deepEqual(skill.data, {});
  assert.equal(skill.body, '# Body\n');
  assert.equal(skill.bodyStartLine, 3);
  assert.equal(skill.frontmatterEndLine, 2);
});

test('supports CRLF files and preserves line numbers', () => {
  const raw = '---\r\nname: crlf-skill\r\ndescription: Uses CRLF.\r\n---\r\n# Body\r\n';
  const skill = parseSkill(raw, FILE);

  assert.equal(skill.frontmatterError, null);
  assert.equal(skill.data.name, 'crlf-skill');
  assert.equal(skill.body, '# Body\r\n');
  assert.equal(skill.bodyStartLine, 5);
  assert.equal(skill.frontmatterEndLine, 4);
});

test('parses block scalars', () => {
  const raw = '---\nname: folded\ndescription: >-\n  Does one thing.\n  Use when needed.\n---\nbody\n';
  const skill = parseSkill(raw, FILE);

  assert.equal(skill.frontmatterError, null);
  assert.equal(skill.data.description, 'Does one thing. Use when needed.');
  assert.equal(skill.body, 'body\n');
  assert.equal(skill.bodyStartLine, 7);
});

test('parses quoted values and inline lists', () => {
  const raw = '---\nname: quoted\ndescription: "A: quoted value"\nallowed-tools: [Read, "Bash(git status:*)"]\n---\nbody\n';
  const skill = parseSkill(raw, FILE);

  assert.equal(skill.frontmatterError, null);
  assert.equal(skill.data.description, 'A: quoted value');
  assert.deepEqual(skill.data['allowed-tools'], ['Read', 'Bash(git status:*)']);
});

test('duplicate keys are an error with the original line number', () => {
  const raw = '---\nname: first\nname: second\n---\nbody\n';
  const skill = parseSkill(raw, FILE);

  assert.equal(skill.frontmatterError.code, 'invalid');
  assert.equal(skill.frontmatterError.line, 3);
  assert.match(skill.frontmatterError.message, /Invalid YAML frontmatter:/);
  assert.match(skill.frontmatterError.message, /unique/i);
  assert.deepEqual(skill.data, {});
  assert.equal(skill.body, 'body\n');
});

test('invalid YAML reports an error and still finds the body', () => {
  const raw = '---\nname: [unclosed\n---\nbody\n';
  const skill = parseSkill(raw, FILE);

  assert.equal(skill.frontmatterError.code, 'invalid');
  assert.equal(skill.frontmatterError.line, 2);
  assert.equal(skill.body, 'body\n');
  assert.equal(skill.bodyStartLine, 4);
});

test('scalar frontmatter is not a mapping', () => {
  const skill = parseSkill('---\njust a string\n---\nbody\n', FILE);

  assert.equal(skill.frontmatterError.code, 'not-object');
  assert.match(skill.frontmatterError.message, /not a string/);
  assert.deepEqual(skill.data, {});
});

test('array frontmatter is not a mapping', () => {
  const skill = parseSkill('---\n- one\n- two\n---\nbody\n', FILE);

  assert.equal(skill.frontmatterError.code, 'not-object');
  assert.match(skill.frontmatterError.message, /not an array/);
});

test('null frontmatter becomes an empty mapping', () => {
  const skill = parseSkill('---\nnull\n---\nbody\n', FILE);

  assert.equal(skill.frontmatterError, null);
  assert.deepEqual(skill.data, {});
});

test('UTF-8 BOM is reported', () => {
  const raw = '\uFEFF---\nname: bom-skill\n---\nbody\n';
  const skill = parseSkill(raw, FILE);

  assert.equal(skill.frontmatterError.code, 'bom');
  assert.equal(skill.frontmatterError.line, 1);
  assert.equal(skill.data.name, 'bom-skill');
  assert.equal(skill.body, 'body\n');
  assert.equal(skill.bodyStartLine, 4);
});

test('unterminated frontmatter is an error', () => {
  const skill = parseSkill('---\nname: broken\n', FILE);

  assert.equal(skill.frontmatterError.code, 'invalid');
  assert.match(skill.frontmatterError.message, /missing closing/);
  assert.equal(skill.body, '');
  assert.equal(skill.bodyStartLine, 4);
  assert.equal(skill.frontmatterEndLine, 0);
});

test('an empty file is missing frontmatter', () => {
  const skill = parseSkill('', FILE);

  assert.equal(skill.frontmatterError.code, 'missing');
  assert.equal(skill.body, '');
  assert.equal(skill.bodyStartLine, 1);
});

test('only the first closing delimiter ends frontmatter', () => {
  const raw = '---\nname: divider\n---\n# Body\n\n---\n\nAfter\n';
  const skill = parseSkill(raw, FILE);

  assert.equal(skill.frontmatterError, null);
  assert.equal(skill.body, '# Body\n\n---\n\nAfter\n');
  assert.equal(skill.bodyStartLine, 4);
});

test('frontmatter delimiters must be the first line', () => {
  const skill = parseSkill('\n---\nname: nope\n---\nbody\n', FILE);

  assert.equal(skill.frontmatterError.code, 'missing');
  assert.equal(skill.body.startsWith('\n---'), true);
});

test('frontmatter delimiters may not have trailing spaces', () => {
  const skill = parseSkill('--- \nname: nope\n---\nbody\n', FILE);

  assert.equal(skill.frontmatterError.code, 'missing');
});

test('name falls back to the directory and trims whitespace', () => {
  assert.equal(parseSkill('---\nname: "  spaced  "\n---\nbody\n', FILE).name, 'spaced');
  assert.equal(parseSkill('---\nname: ""\n---\nbody\n', FILE).name, 'my-skill');
  assert.equal(parseSkill('---\nother: value\n---\nbody\n', FILE).name, 'my-skill');
});

test('parseFrontmatter exposes raw and line metadata', () => {
  const parsed = parseFrontmatter('---\nname: raw\ndescription: yes\n---\nbody');
  assert.equal(parsed.raw, 'name: raw\ndescription: yes');
  assert.equal(parsed.startLine, 2);
  assert.equal(parsed.endLine, 4);
  assert.equal(parsed.body, 'body');
  assert.equal(parsed.bodyStartLine, 5);
  assert.equal(parsed.error, null);
});

test('YAML errors do not throw for unusual input', () => {
  const samples = [
    '---\n[bad\n---\n',
    '---\n\tname: tab\n---\n',
    '---\nname: *missing\n---\n',
    '---\na: &x 1\nb: *x\nc: *x\n---\n',
    '---\n? [complex]\n: value\n---\n',
  ];
  for (const sample of samples) {
    assert.doesNotThrow(() => parseSkill(sample, FILE));
  }
});
