import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { discoverSkillFiles, globToRegExp, isExcluded, DiscoveryError } from '../src/discover.js';
import { tempDir, writeFile, writeSkill } from './helpers.js';

const FRONTMATTER = { name: 'test-skill', description: 'Test. Use when testing.' };

test('globToRegExp supports stars, globstars, and question marks', () => {
  assert.equal(globToRegExp('*.md').test('SKILL.md'), true);
  assert.equal(globToRegExp('*.md').test('nested/SKILL.md'), true);
  assert.equal(globToRegExp('**/fixtures/**').test('test/fixtures/a/SKILL.md'), true);
  assert.equal(globToRegExp('**/fixtures/**').test('test/other/a/SKILL.md'), false);
  assert.equal(globToRegExp('docs/?/guide.md').test('docs/a/guide.md'), true);
  assert.equal(globToRegExp('docs/?/guide.md').test('docs/ab/guide.md'), false);
});

test('isExcluded handles directory patterns', () => {
  assert.equal(isExcluded('test/fixtures/SKILL.md', ['fixtures/']), true);
  assert.equal(isExcluded('test/fixtures/SKILL.md', ['**/fixtures/**']), true);
  assert.equal(isExcluded('test/other/SKILL.md', ['**/fixtures/**']), false);
  assert.equal(isExcluded('test/other/SKILL.md', []), false);
});

test('discovers nested skills and .claude/skills', (t) => {
  const root = tempDir(t);
  writeSkill(root, { frontmatter: FRONTMATTER, skillName: 'alpha' });
  writeSkill(root, { frontmatter: FRONTMATTER, skillName: '.claude/skills/beta' });
  writeSkill(root, { frontmatter: FRONTMATTER, skillName: 'packages/app/.claude/skills/gamma' });

  const files = discoverSkillFiles(['.'], { cwd: root });
  assert.deepEqual(files, [
    path.join(root, '.claude/skills/beta/SKILL.md'),
    path.join(root, 'alpha/SKILL.md'),
    path.join(root, 'packages/app/.claude/skills/gamma/SKILL.md'),
  ]);
});

test('skips dependency and build directories', (t) => {
  const root = tempDir(t);
  writeSkill(root, { frontmatter: FRONTMATTER, skillName: 'good' });
  for (const directory of ['node_modules/pkg', '.git/hooks', 'dist', 'build', 'coverage', 'vendor']) {
    writeSkill(root, { frontmatter: FRONTMATTER, skillName: directory });
  }
  const files = discoverSkillFiles(['.'], { cwd: root });
  assert.deepEqual(files, [path.join(root, 'good/SKILL.md')]);
});

test('exclude patterns skip files and directories', (t) => {
  const root = tempDir(t);
  writeSkill(root, { frontmatter: FRONTMATTER, skillName: 'keep' });
  writeSkill(root, { frontmatter: FRONTMATTER, skillName: 'drop' });
  writeSkill(root, { frontmatter: FRONTMATTER, skillName: 'test/fixtures/nested' });

  const files = discoverSkillFiles(['.'], {
    cwd: root,
    exclude: ['drop/', '**/fixtures/**'],
  });
  assert.deepEqual(files, [path.join(root, 'keep/SKILL.md')]);
});

test('an explicit SKILL.md path is accepted', (t) => {
  const root = tempDir(t);
  const file = writeSkill(root, { frontmatter: FRONTMATTER, skillName: 'one' });
  assert.deepEqual(discoverSkillFiles([file], { cwd: root }), [file]);
});

test('explicit non-SKILL files are rejected', (t) => {
  const root = tempDir(t);
  const file = writeFile(root, 'README.md', '# Readme\n');
  assert.throws(() => discoverSkillFiles([file], { cwd: root }), DiscoveryError);
  assert.deepEqual(discoverSkillFiles([root], { cwd: root }), []);
});

test('missing paths are rejected', (t) => {
  const root = tempDir(t);
  assert.throws(() => discoverSkillFiles(['nope'], { cwd: root }), /Path not found/);
});

test('deduplicates symlinked skills and survives cycles', (t) => {
  const root = tempDir(t);
  const real = path.join(root, 'real');
  writeSkill(real, { frontmatter: FRONTMATTER });

  try {
    fs.symlinkSync(real, path.join(root, 'alias'), 'dir');
    fs.symlinkSync(root, path.join(root, 'loop'), 'dir');
  } catch {
    t.skip('symlinks are not available');
    return;
  }

  const files = discoverSkillFiles(['.'], { cwd: root });
  assert.equal(files.length, 1);
  assert.equal(fs.realpathSync(files[0]), fs.realpathSync(path.join(real, 'SKILL.md')));
});
