import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));
export const binPath = path.join(repoRoot, 'bin', 'skillproof.mjs');

/**
 * Build a Skill object without touching the filesystem or the parser.
 * This keeps rule tests independent of the parser implementation.
 *
 * @param {Partial<import('../src/types.js').Skill> & {data?: Record<string, unknown>}} [overrides]
 * @returns {import('../src/types.js').Skill}
 */
export function makeSkill(overrides = {}) {
  const dirName = overrides.dirName ?? 'test-skill';
  const filePath = overrides.filePath ?? path.join(repoRoot, 'test-fixtures', dirName, 'SKILL.md');
  const dir = overrides.dir ?? path.dirname(filePath);
  const data = overrides.data ?? {
    name: dirName,
    description: 'Does a useful thing. Use when the user asks for the useful thing.',
  };
  const body = overrides.body ?? '# Test skill\n\nFollow these instructions.\n';
  const frontmatterRaw = overrides.frontmatterRaw
    ?? stringify(data).trimEnd();
  const raw = overrides.raw ?? `---\n${frontmatterRaw}\n---\n${body}`;
  const lines = raw.split(/\r?\n/);
  const closingIndex = lines.indexOf('---', 1);
  const bodyStartLine = overrides.bodyStartLine ?? (closingIndex === -1 ? 1 : closingIndex + 2);

  return {
    filePath,
    dir,
    dirName,
    raw,
    lines,
    body,
    bodyStartLine,
    frontmatterRaw,
    frontmatterStartLine: overrides.frontmatterStartLine ?? 2,
    frontmatterEndLine: overrides.frontmatterEndLine ?? (closingIndex === -1 ? 0 : closingIndex + 1),
    data,
    frontmatterError: overrides.frontmatterError ?? null,
    name: overrides.name
      ?? (typeof data.name === 'string' && data.name.trim() ? data.name.trim() : dirName),
  };
}

/**
 * Create a temp directory that is removed when the test finishes.
 * @param {import('node:test').TestContext} t
 * @param {string} [prefix]
 * @returns {string}
 */
export function tempDir(t, prefix = 'skillproof-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * Write a SKILL.md into `dir` (or `dir/<skillName>/SKILL.md` when skillName is set).
 * @param {string} dir
 * @param {{frontmatter?: Record<string, unknown>, body?: string, raw?: string, skillName?: string}} [options]
 * @returns {string} Absolute path to the written file.
 */
export function writeSkill(dir, options = {}) {
  const targetDir = options.skillName ? path.join(dir, options.skillName) : dir;
  fs.mkdirSync(targetDir, { recursive: true });
  const filePath = path.join(targetDir, 'SKILL.md');
  const raw = options.raw
    ?? `---\n${stringify(options.frontmatter ?? {}).trimEnd()}\n---\n${options.body ?? '# Test skill\n'}`;
  fs.writeFileSync(filePath, raw);
  return filePath;
}

/**
 * Write an arbitrary file, creating parent directories.
 * @param {string} dir
 * @param {string} relativePath
 * @param {string} [content]
 * @returns {string}
 */
export function writeFile(dir, relativePath, content = '') {
  const filePath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * Spawn the CLI and capture its output.
 * @param {string[]} args
 * @param {{cwd?: string, env?: Record<string, string>}} [options]
 * @returns {{status: number|null, stdout: string, stderr: string}}
 */
export function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [binPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      ...options.env,
    },
  });

  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
