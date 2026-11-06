import fs from 'node:fs';
import path from 'node:path';
import { escapeRegExp, toPosix } from '../utils.js';

const LINK_PATTERN = /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+["'][^"']*["'])?\s*\)/g;
const RESOURCE_EXTENSIONS = new Set([
  '.md', '.markdown', '.py', '.sh', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.yaml', '.yml', '.toml', '.txt', '.csv', '.html', '.css', '.xml',
  '.pdf', '.png', '.jpg', '.jpeg', '.svg',
]);
const IGNORED_NAMES = new Set(['readme.md', 'license', 'license.md', 'changelog.md']);

/**
 * Replace fenced code block lines with empty strings while preserving line count.
 * @param {string} body
 * @returns {string[]}
 */
export function maskFencedCodeLines(body) {
  const lines = body.split('\n');
  let fenceCharacter = null;
  let fenceLength = 0;

  return lines.map((line) => {
    const trimmed = line.trim();

    if (fenceCharacter === null) {
      const opening = /^(`{3,}|~{3,})/.exec(trimmed);
      if (opening) {
        fenceCharacter = opening[1][0];
        fenceLength = opening[1].length;
        return '';
      }
      return line;
    }

    const closing = new RegExp(`^${escapeRegExp(fenceCharacter)}{${fenceLength},}\\s*$`);
    if (closing.test(trimmed)) {
      fenceCharacter = null;
      fenceLength = 0;
    }
    return '';
  });
}

/**
 * @param {string} line
 * @returns {string[]}
 */
export function extractLinkTargets(line) {
  const targets = [];
  for (const match of line.matchAll(LINK_PATTERN)) {
    const target = match[1] ?? match[2];
    if (target) targets.push(target);
  }
  return targets;
}

/**
 * @param {string} target
 * @returns {string|null} Normalized local path, or null when the target is not a local file.
 */
function localTarget(target) {
  if (!target || target.startsWith('#')) return null;
  if (/[{}<>*]/.test(target) || target.includes('${')) return null;
  if (target.includes('\\')) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(target)) return null;

  const withoutFragment = target.split('#')[0].split('?')[0];
  if (!withoutFragment) return null;

  try {
    return decodeURIComponent(withoutFragment);
  } catch {
    return withoutFragment;
  }
}

/**
 * @param {import('../types.js').Skill} skill
 * @param {string} target
 * @returns {string}
 */
function resolveTarget(skill, target) {
  return path.resolve(skill.dir, target);
}

/**
 * @param {string} dir
 * @param {string} filePath
 * @returns {boolean}
 */
function isInside(dir, filePath) {
  const relative = path.relative(dir, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * @param {import('../types.js').Skill} skill
 * @param {string[]} maskedLines
 * @returns {{target: string, line: number, resolved: string}[]}
 */
function localMarkdownLinks(skill, maskedLines) {
  const links = [];
  const seen = new Set();

  for (let index = 0; index < maskedLines.length; index += 1) {
    for (const rawTarget of extractLinkTargets(maskedLines[index])) {
      const target = localTarget(rawTarget);
      if (!target || !/\.md$/i.test(target)) continue;
      const resolved = resolveTarget(skill, target);
      if (seen.has(resolved)) continue;
      if (!fs.existsSync(resolved)) continue;
      seen.add(resolved);
      links.push({ target, line: skill.bodyStartLine + index, resolved });
    }
  }

  return links;
}

/**
 * @param {string} filePath
 * @returns {string[]|null}
 */
function readLines(filePath) {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size > 1024 * 1024) return null;
    return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  } catch {
    return null;
  }
}

/**
 * @param {string} directory
 * @param {number} depth
 * @param {string[]} output
 * @returns {void}
 */
function walkResourceFiles(directory, depth, output) {
  if (depth > 5) return;

  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkResourceFiles(absolute, depth + 1, output);
      continue;
    }

    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        isFile = fs.statSync(absolute).isFile();
      } catch {
        continue;
      }
    }
    if (!isFile) continue;
    if (entry.name === 'SKILL.md' || IGNORED_NAMES.has(entry.name.toLowerCase())) continue;
    if (!RESOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    output.push(absolute);
  }
}

/** @type {import('../types.js').Rule[]} */
export const referenceRules = [
  {
    id: 'broken-reference',
    title: 'Broken local reference',
    defaultSeverity: 'warning',
    description: 'Finds Markdown links to local files that do not exist.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const masked = maskFencedCodeLines(skill.body);
      const findings = [];
      const seen = new Set();

      for (let index = 0; index < masked.length; index += 1) {
        for (const rawTarget of extractLinkTargets(masked[index])) {
          const target = localTarget(rawTarget);
          if (!target || seen.has(target)) continue;
          seen.add(target);
          const resolved = resolveTarget(skill, target);
          if (fs.existsSync(resolved)) continue;
          findings.push({
            message: `Local reference "${target}" does not exist.`,
            hint: 'Fix the path or remove the link.',
            line: skill.bodyStartLine + index,
          });
        }
      }

      return findings;
    },
  },
  {
    id: 'nested-reference',
    title: 'Nested progressive disclosure',
    defaultSeverity: 'warning',
    description: 'Warns when a reference file links to another reference file instead of linking from SKILL.md.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const masked = maskFencedCodeLines(skill.body);
      const findings = [];

      for (const link of localMarkdownLinks(skill, masked)) {
        if (!isInside(skill.dir, link.resolved)) continue;
        const referenceLines = readLines(link.resolved);
        if (!referenceLines) continue;

        const referenceName = toPosix(path.relative(skill.dir, link.resolved));
        let found = false;
        for (const referenceLine of maskFencedCodeLines(referenceLines.join('\n'))) {
          if (found) break;
          for (const rawTarget of extractLinkTargets(referenceLine)) {
            const target = localTarget(rawTarget);
            if (!target || !/\.md$/i.test(target)) continue;
            const resolved = resolveTarget(skill, path.join(path.dirname(referenceName), target));
            if (resolved === link.resolved) continue;
            if (path.basename(resolved).toLowerCase() === 'skill.md') continue;
            if (!fs.existsSync(resolved)) continue;
            findings.push({
              message: `Reference "${referenceName}" links to another file, "${target}".`,
              hint: 'Link every reference file directly from SKILL.md so Claude reads one level deep.',
              line: link.line,
            });
            found = true;
            break;
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'reference-toc',
    title: 'Long reference needs a contents section',
    defaultSeverity: 'info',
    description: 'Suggests a table of contents for referenced Markdown files over 100 lines.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const masked = maskFencedCodeLines(skill.body);
      const findings = [];
      const seen = new Set();

      for (const link of localMarkdownLinks(skill, masked)) {
        if (!isInside(skill.dir, link.resolved) || seen.has(link.resolved)) continue;
        if (!/\.md$/i.test(link.resolved)) continue;
        seen.add(link.resolved);

        const lines = readLines(link.resolved);
        if (!lines || lines.length <= 100) continue;
        const hasContents = lines.slice(0, 40).some((line) => /^#{1,6}\s+(?:table of )?contents\b/i.test(line.trim()));
        if (hasContents) continue;

        findings.push({
          message: `Reference "${toPosix(path.relative(skill.dir, link.resolved))}" is over 100 lines with no contents section.`,
          hint: 'Add a "## Contents" overview so partial reads still reveal the full scope.',
          line: link.line,
        });
      }

      return findings;
    },
  },
  {
    id: 'orphan-resource',
    title: 'Unreferenced bundled file',
    defaultSeverity: 'info',
    description: 'Finds bundled files that SKILL.md never mentions.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const files = [];
      walkResourceFiles(skill.dir, 0, files);
      const findings = [];

      for (const filePath of files) {
        const relative = toPosix(path.relative(skill.dir, filePath));
        const basename = path.basename(filePath);
        if (skill.body.includes(relative) || skill.body.includes(basename)) continue;
        findings.push({
          message: `Bundled file "${relative}" is never referenced from SKILL.md.`,
          hint: 'Reference it with a relative link or remove it from the skill directory.',
          file: filePath,
          line: 1,
        });
        if (findings.length >= 10) break;
      }

      return findings;
    },
  },
];
