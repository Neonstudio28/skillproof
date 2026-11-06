import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCli, tempDir, writeFile, writeSkill } from './helpers.js';

const GOOD = {
  name: 'good-skill',
  description: 'Does a useful thing. Use when the user asks for the useful thing.',
};

/**
 * @param {import('node:test').TestContext} t
 * @returns {string}
 */
function goodProject(t) {
  const root = tempDir(t);
  writeSkill(root, {
    frontmatter: GOOD,
    skillName: 'good-skill',
    body: '# Good skill\n\nDo the useful thing.\n',
  });
  return root;
}

/**
 * @param {import('node:test').TestContext} t
 * @returns {string}
 */
function warningProject(t) {
  const root = tempDir(t);
  writeSkill(root, {
    frontmatter: { ...GOOD, name: 'warn-skill' },
    skillName: 'warn-dir',
    body: '# Warning skill\n\nDo the thing.\n',
  });
  return root;
}

/**
 * @param {import('node:test').TestContext} t
 * @returns {string}
 */
function errorProject(t) {
  const root = tempDir(t);
  writeSkill(root, {
    frontmatter: { name: 'broken-skill' },
    skillName: 'broken-skill',
    body: '# Broken skill\n\nDo the thing.\n',
  });
  return root;
}

test('a clean project exits zero with pretty output', (t) => {
  const root = goodProject(t);
  const result = runCli(['.'], { cwd: root });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /SkillProof 0\.1\.0/);
  assert.match(result.stdout, /100\/100 A/);
  assert.match(result.stdout, /All checks passed/);
  assert.equal(result.stderr, '');
});

test('--format json emits stable machine-readable output', (t) => {
  const root = goodProject(t);
  const result = runCli(['.', '--format', 'json'], { cwd: root });
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.tool, 'skillproof');
  assert.equal(payload.version, '0.1.0');
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.failureReasons, []);
  assert.deepEqual(payload.summary, {
    skills: 1,
    errors: 0,
    warnings: 0,
    info: 0,
    score: 100,
    grade: 'A',
  });
  assert.equal(payload.skills.length, 1);
  assert.equal(payload.skills[0].path, 'good-skill/SKILL.md');
  assert.equal(payload.skills[0].name, 'good-skill');
  assert.deepEqual(payload.skills[0].findings, []);
  assert.equal(Object.hasOwn(payload, 'cwd'), false);
});

test('--json is an alias for --format json', (t) => {
  const root = goodProject(t);
  const result = runCli(['--json'], { cwd: root });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).tool, 'skillproof');
});

test('errors fail with exit code 1 and a readable report', (t) => {
  const root = errorProject(t);
  const result = runCli(['.'], { cwd: root });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Failed:/);
  assert.match(result.stdout, /1 error/);
  assert.match(result.stdout, /description-required/);
});

test('warnings pass by default but fail under --strict', (t) => {
  const root = warningProject(t);
  const relaxed = runCli(['.'], { cwd: root });
  assert.equal(relaxed.status, 0);
  assert.match(relaxed.stdout, /warning/);

  const strict = runCli(['.', '--strict'], { cwd: root });
  assert.equal(strict.status, 1);
  assert.match(strict.stdout, /strict mode/);
});

test('--no-strict overrides a config file', (t) => {
  const root = warningProject(t);
  writeFile(root, '.skillproofrc.json', JSON.stringify({ strict: true }));
  assert.equal(runCli(['.'], { cwd: root }).status, 1);
  assert.equal(runCli(['.', '--no-strict'], { cwd: root }).status, 0);
});

test('--min-score and --max-warnings enforce thresholds', (t) => {
  const root = warningProject(t);
  assert.equal(runCli(['.', '--min-score', '95'], { cwd: root }).status, 0);
  const lowScore = runCli(['.', '--min-score', '96'], { cwd: root });
  assert.equal(lowScore.status, 1);
  assert.match(lowScore.stdout, /min-score 96/);

  assert.equal(runCli(['.', '--max-warnings', '1'], { cwd: root }).status, 0);
  const tooMany = runCli(['.', '--max-warnings', '0'], { cwd: root });
  assert.equal(tooMany.status, 1);
  assert.match(tooMany.stdout, /max-warnings 0/);
});

test('config rules can turn findings off', (t) => {
  const root = warningProject(t);
  writeFile(root, '.skillproofrc.json', JSON.stringify({ rules: { 'name-directory': 'off' } }));
  const result = runCli(['.'], { cwd: root });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /100\/100 A/);
});

test('--exclude skips matching skills', (t) => {
  const root = warningProject(t);
  writeSkill(root, {
    frontmatter: GOOD,
    skillName: 'good-skill',
    body: '# Good skill\n\nDo the thing.\n',
  });
  const result = runCli(['.', '--exclude', 'warn-dir/'], { cwd: root });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /1 skill/);
  assert.doesNotMatch(result.stdout, /warn-dir/);
});

test('github format emits workflow commands', (t) => {
  const root = warningProject(t);
  const result = runCli(['.', '--format', 'github'], { cwd: root });
  assert.equal(result.status, 0);
  const lines = result.stdout.trim().split('\n');
  assert.match(lines[0], /^::warning file=warn-dir\/SKILL\.md,line=2,title=skillproof\/name-directory::/);
  assert.match(lines[1], /^::notice title=SkillProof::/);
});

test('github format emits an error summary for failures', (t) => {
  const root = errorProject(t);
  const result = runCli(['.', '--format', 'github'], { cwd: root });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^::error file=broken-skill\/SKILL\.md/m);
  assert.match(result.stdout, /^::error title=SkillProof::/m);
});

test('no skills is an error unless --allow-empty is set', (t) => {
  const root = tempDir(t);
  const failed = runCli(['.'], { cwd: root });
  assert.equal(failed.status, 2);
  assert.match(failed.stderr, /No SKILL\.md files found/);

  const empty = runCli(['.', '--allow-empty', '--format', 'json'], { cwd: root });
  assert.equal(empty.status, 0);
  const payload = JSON.parse(empty.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.summary.skills, 0);
  assert.deepEqual(payload.skills, []);
});

test('--help, --version, and --list-rules exit zero', () => {
  const help = runCli(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: skillproof/);
  assert.match(help.stdout, /--min-score/);

  const version = runCli(['--version']);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), 'skillproof 0.1.0');

  const rules = runCli(['--list-rules']);
  assert.equal(rules.status, 0);
  assert.match(rules.stdout, /SkillProof rules \(30\)/);
  assert.match(rules.stdout, /description-required/);
});

test('usage errors exit 2', (t) => {
  const root = goodProject(t);
  assert.equal(runCli(['--wat'], { cwd: root }).status, 2);
  assert.equal(runCli(['--format', 'yaml'], { cwd: root }).status, 2);
  assert.equal(runCli(['--min-score', '101'], { cwd: root }).status, 2);
  assert.equal(runCli(['--max-warnings', '-1'], { cwd: root }).status, 2);
  assert.equal(runCli(['--config', 'missing.json'], { cwd: root }).status, 2);
  assert.equal(runCli(['missing-path'], { cwd: root }).status, 2);
});

test('-- ends option parsing for paths that begin with a dash', (t) => {
  const root = tempDir(t);
  writeSkill(root, {
    frontmatter: { ...GOOD, name: 'dash-skill' },
    skillName: '-dash-skill',
    body: '# Dash\n\nDo it.\n',
  });
  const result = runCli(['--', '-dash-skill'], { cwd: root });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dash-skill/);
});

test('--no-color disables ANSI output', (t) => {
  const root = goodProject(t);
  const result = runCli(['.', '--no-color'], { cwd: root });
  assert.equal(result.status, 0);
  assert.equal(/\u001B\[/.test(result.stdout), false);
});

test('package version matches package.json', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
});
