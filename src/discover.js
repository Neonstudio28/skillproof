import fs from 'node:fs';
import path from 'node:path';
import { escapeRegExp, toPosix } from './utils.js';

const SKIP_DIRS = new Set([
  '.cache',
  '.git',
  '.hg',
  '.next',
  '.nuxt',
  '.svn',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'vendor',
  'venv',
]);

const MAX_DEPTH = 25;

export class DiscoveryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DiscoveryError';
  }
}

/**
 * Translate a small, predictable glob subset into a RegExp.
 * Supported: `*` (within a segment), `**` (across segments), `?` (one
 * non-slash character). A pattern without a slash matches at any depth. A
 * pattern ending in `/` also matches everything below that directory.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let pattern = toPosix(glob).replace(/^\.\//, '');
  const directoryPattern = pattern.endsWith('/');
  if (directoryPattern) pattern = pattern.slice(0, -1);
  if (pattern === '') return /^$/;
  if (!pattern.includes('/')) pattern = `**/${pattern}`;

  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (character === '*') {
      if (pattern[index + 1] === '*') {
        index += 1;
        if (pattern[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += escapeRegExp(character);
    }
  }

  if (directoryPattern) source += '(?:/.*)?';
  source += '$';
  return new RegExp(source);
}

/**
 * @param {string} relativePath
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function isExcluded(relativePath, patterns) {
  if (!patterns || patterns.length === 0) return false;
  const candidate = toPosix(relativePath).replace(/^\.\//, '');
  return patterns.some((pattern) => globToRegExp(pattern).test(candidate));
}

/**
 * Find every `SKILL.md` under the given files or directories.
 *
 * Explicit file paths must point at a file named `SKILL.md`, which catches the
 * common mistake of passing a skill directory's `README.md`.
 *
 * @param {string[]} inputPaths
 * @param {{cwd?: string, exclude?: string[]}} [options]
 * @returns {string[]} Absolute paths, sorted, deduplicated by real path.
 */
export function discoverSkillFiles(inputPaths, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const exclude = options.exclude ?? [];
  const found = new Map();
  const visitedDirectories = new Set();

  if (!Array.isArray(inputPaths) || inputPaths.length === 0) {
    throw new DiscoveryError('No paths were provided.');
  }

  const add = (filePath) => {
    let realPath;
    try {
      realPath = fs.realpathSync(filePath);
    } catch {
      realPath = filePath;
    }
    if (!found.has(realPath)) found.set(realPath, filePath);
  };

  const walk = (directory, depth) => {
    if (depth > MAX_DEPTH) return;

    let realDirectory;
    try {
      realDirectory = fs.realpathSync(directory);
    } catch {
      realDirectory = directory;
    }
    if (visitedDirectories.has(realDirectory)) return;
    visitedDirectories.add(realDirectory);

    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = toPosix(path.relative(cwd, absolute));

      let isDirectory = entry.isDirectory();
      let isFile = entry.isFile();

      if (entry.isSymbolicLink()) {
        try {
          const stats = fs.statSync(absolute);
          isDirectory = stats.isDirectory();
          isFile = stats.isFile();
        } catch {
          continue;
        }
      }

      if (isDirectory) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (isExcluded(`${relative}/`, exclude) || isExcluded(relative, exclude)) continue;
        walk(absolute, depth + 1);
        continue;
      }

      if (!isFile || entry.name !== 'SKILL.md') continue;
      if (isExcluded(relative, exclude)) continue;
      add(absolute);
    }
  };

  for (const input of inputPaths) {
    const absolute = path.resolve(cwd, input);
    let stats;
    try {
      stats = fs.statSync(absolute);
    } catch {
      throw new DiscoveryError(`Path not found: ${input}`);
    }

    if (stats.isFile()) {
      if (path.basename(absolute) !== 'SKILL.md') {
        throw new DiscoveryError(`Expected a file named SKILL.md, got: ${input}`);
      }
      const relative = toPosix(path.relative(cwd, absolute));
      if (!isExcluded(relative, exclude)) add(absolute);
      continue;
    }

    if (stats.isDirectory()) {
      const relative = toPosix(path.relative(cwd, absolute));
      if (isExcluded(`${relative}/`, exclude) || isExcluded(relative, exclude)) continue;
      walk(absolute, 0);
      continue;
    }

    throw new DiscoveryError(`Unsupported path type: ${input}`);
  }

  return [...found.values()].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
