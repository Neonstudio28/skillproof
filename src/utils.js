import path from 'node:path';

/**
 * Convert a platform path to POSIX separators for display and glob matching.
 * @param {string} value
 * @returns {string}
 */
export function toPosix(value) {
  return value.split(path.sep).join('/');
}

/**
 * Return `filePath` relative to `cwd` using POSIX separators.
 * @param {string} cwd
 * @param {string} filePath
 * @returns {string}
 */
export function relativeTo(cwd, filePath) {
  const relative = path.relative(cwd, filePath);
  return toPosix(relative || path.basename(filePath));
}

/**
 * Escape a string so it can be embedded in a regular expression.
 * @param {string} value
 * @returns {string}
 */
export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rough token estimate used for context-budget warnings. Four characters per
 * token is the usual rule of thumb for English prose and code.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * True for plain objects (not arrays and not null).
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Find the 1-based line of a top-level frontmatter key.
 * @param {import('./types.js').Skill} skill
 * @param {string} field
 * @returns {number}
 */
export function lineOfField(skill, field) {
  const pattern = new RegExp(`^\\s*${escapeRegExp(field)}\\s*:`);
  for (let index = 0; index < skill.lines.length; index += 1) {
    if (pattern.test(skill.lines[index])) return index + 1;
  }
  return skill.frontmatterStartLine || 1;
}

/**
 * Find the 1-based line of the first body line containing `needle`.
 * @param {import('./types.js').Skill} skill
 * @param {string} needle
 * @returns {number}
 */
export function lineInBody(skill, needle) {
  if (typeof skill.body !== 'string') return skill.bodyStartLine || 1;
  const index = skill.body.split('\n').findIndex((line) => line.includes(needle));
  return index === -1 ? skill.bodyStartLine || 1 : skill.bodyStartLine + index;
}

/**
 * Find the 1-based line of the first line in the raw file matching `pattern`.
 * @param {import('./types.js').Skill} skill
 * @param {RegExp} pattern
 * @returns {number|undefined}
 */
export function lineMatching(skill, pattern) {
  for (let index = 0; index < skill.lines.length; index += 1) {
    if (pattern.test(skill.lines[index])) return index + 1;
  }
  return undefined;
}

/**
 * Word-boundary test that is safe for non-ASCII descriptions.
 * @param {string} text
 * @param {RegExp} pattern
 * @returns {boolean}
 */
export function test(text, pattern) {
  return pattern.test(text);
}
