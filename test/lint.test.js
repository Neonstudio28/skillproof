import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lintSkill, lintSkillFiles } from '../src/lint.js';
import { parseSkill } from '../src/frontmatter.js';
import { makeSkill, tempDir, writeFile, writeSkill } from './helpers.js';

const GOOD = {
  name: 'good-skill',
  description: 'Does a useful thing. Use when the user asks for the useful thing.',
};

test('a good skill passes with a perfect score', () => {
  const skill = makeSkill({ data: GOOD, dirName: 'good-skill' });
  const result = lintSkill(skill);
  assert.equal(result.score, 100);
  assert.equal(result.grade, 'A');
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.summary, { errors: 0, warnings: 0, info: 0 });
});

test('errors and warnings affect the score', () => {
  const skill = makeSkill({
    data: { name: 'Bad Name', description: 'I can help. Use when asked.' },
    dirName: 'bad-name',
    body: 'TODO: write instructions\n',
  });
  const result = lintSkill(skill);
  assert.ok(result.findings.some((finding) => finding.severity === 'error'));
  assert.ok(result.findings.some((finding) => finding.severity === 'warning'));
  assert.ok(result.score < 100);
  assert.equal(result.summary.errors + result.summary.warnings + result.summary.info, result.findings.length);
});

test('frontmatter failures become engine-level errors', () => {
  const result = lintSkill(makeSkill({
    raw: '# no frontmatter\n',
    data: {},
    frontmatterError: { code: 'missing', message: 'Missing frontmatter.', line: 1 },
  }));
  assert.equal(result.findings[0].ruleId, 'frontmatter-missing');
  assert.equal(result.findings[0].severity, 'error');
  assert.equal(result.findings[0].line, 1);
});

test('rule severities can be overridden and turned off', () => {
  const skill = makeSkill({ data: { ...GOOD, description: 'Processes files.' } });
  const before = lintSkill(skill);
  assert.ok(before.findings.some((finding) => finding.ruleId === 'description-trigger'));

  const off = lintSkill(skill, { 'description-trigger': 'off' });
  assert.equal(off.findings.some((finding) => finding.ruleId === 'description-trigger'), false);

  const error = lintSkill(skill, { 'description-trigger': 'error' });
  const finding = error.findings.find((entry) => entry.ruleId === 'description-trigger');
  assert.equal(finding.severity, 'error');
  assert.ok(error.score < before.score);
});

test('findings are sorted by line and then severity', () => {
  const skill = makeSkill({
    data: { name: 'Bad Name', description: 'I can help. Use when asked.' },
    dirName: 'bad-name',
    body: '# Skill\n\nTODO\n',
  });
  const result = lintSkill(skill);
  const lines = result.findings.map((finding) => finding.line ?? Number.POSITIVE_INFINITY);
  assert.deepEqual(lines, [...lines].sort((left, right) => left - right));
});

test('lintSkillFiles reads files and reports relative paths', (t) => {
  const root = tempDir(t);
  const file = writeSkill(root, {
    frontmatter: GOOD,
    skillName: 'good-skill',
    body: '# Good\n\nDo the thing.\n',
  });
  const { results, summary } = lintSkillFiles([file], { cwd: root });
  assert.equal(results.length, 1);
  assert.equal(results[0].path, 'good-skill/SKILL.md');
  assert.equal(results[0].name, 'good-skill');
  assert.equal(results[0].score, 100);
  assert.equal(summary.skills, 1);
  assert.equal(summary.score, 100);
});

test('lintSkillFiles reports parser errors without throwing', (t) => {
  const root = tempDir(t);
  const file = writeFile(root, 'broken/SKILL.md', '# no frontmatter\n');
  const { results } = lintSkillFiles([file], { cwd: root });
  assert.equal(results[0].findings[0].ruleId, 'frontmatter-missing');
  assert.equal(results[0].path, 'broken/SKILL.md');
});

test('lintSkillFiles resolves reference files relative to the skill', (t) => {
  const root = tempDir(t);
  const dir = path.join(root, 'ref-skill');
  const file = writeSkill(dir, {
    frontmatter: { name: 'ref-skill', description: 'Uses references. Use when testing.' },
    body: '# Ref\n\nSee [guide](reference/guide.md).\n',
  });
  writeFile(dir, 'reference/guide.md', '# Guide\n');
  const { results } = lintSkillFiles([file], { cwd: root });
  assert.equal(results[0].findings.some((finding) => finding.ruleId === 'broken-reference'), false);
  assert.equal(results[0].findings.some((finding) => finding.ruleId === 'orphan-resource'), false);
});

test('parseSkill and lintSkill cooperate on a real file', (t) => {
  const root = tempDir(t);
  const file = writeSkill(root, {
    frontmatter: { ...GOOD, extra: true },
    skillName: 'good-skill',
    body: '# Good\n\nInstructions.\n',
  });
  const skill = parseSkill(fs.readFileSync(file, 'utf8'), file);
  const result = lintSkill(skill);
  assert.ok(result.findings.some((finding) => finding.ruleId === 'frontmatter-unknown-field'));
});
