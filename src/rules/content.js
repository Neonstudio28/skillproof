import { estimateTokens } from '../utils.js';

const HEADING_PATTERN = /^#{1,6}\s+\S/m;
const WINDOWS_PATH_PATTERN = /((?:[A-Za-z]:\\)?(?:[\w.-]+\\)+[\w.-]+\.(?:md|markdown|py|js|mjs|cjs|ts|tsx|jsx|json|ya?ml|toml|sh|ps1|txt|csv|html|css|xml|pdf|png|jpe?g|svg))\b/i;
const UNFINISHED_PATTERN = /\b(?:TODO|TBD|FIXME|XXX)\b/;

/**
 * @param {string} body
 * @returns {number}
 */
function countLines(body) {
  if (body === '') return 0;
  return body.replace(/\n$/, '').split('\n').length;
}

/** @type {import('../types.js').Rule[]} */
export const contentRules = [
  {
    id: 'body-empty',
    title: 'Skill body is empty',
    defaultSeverity: 'warning',
    description: 'Warns when SKILL.md has no instructions after the frontmatter.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      if (skill.body.trim() !== '') return [];
      return [{
        message: 'The skill body is empty; there are no instructions for Claude to follow.',
        hint: 'Add a short workflow and concrete steps after the frontmatter.',
        line: skill.bodyStartLine,
      }];
    },
  },
  {
    id: 'body-heading',
    title: 'Skill body has no heading',
    defaultSeverity: 'info',
    description: 'Suggests a Markdown heading to make the skill easier to scan.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      if (HEADING_PATTERN.test(skill.body)) return [];
      return [{
        message: 'The skill body has no Markdown heading.',
        hint: 'Add a short # heading that matches the skill name.',
        line: skill.bodyStartLine,
      }];
    },
  },
  {
    id: 'body-length',
    title: 'Skill body is too long',
    defaultSeverity: 'warning',
    description: 'Warns when SKILL.md exceeds 500 lines, the recommended limit.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const lines = countLines(skill.body);
      if (lines <= 500) return [];
      return [{
        message: `The skill body is ${lines} lines; keep it under 500.`,
        hint: 'Move detailed material into linked reference files so it loads only when needed.',
        line: skill.bodyStartLine + 500,
      }];
    },
  },
  {
    id: 'body-token-budget',
    title: 'Skill body token budget',
    defaultSeverity: 'warning',
    description: 'Warns when the body is estimated above 5,000 tokens.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const tokens = estimateTokens(skill.body);
      if (tokens <= 5000) return [];
      return [{
        message: `The skill body is roughly ${tokens.toLocaleString('en-US')} tokens; aim for under 5,000.`,
        hint: 'Use progressive disclosure: keep the workflow here and move reference material to separate files.',
        line: skill.bodyStartLine,
      }];
    },
  },
  {
    id: 'windows-path',
    title: 'Windows-style file path',
    defaultSeverity: 'warning',
    description: 'Finds backslash file paths, which break on Unix systems.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const lines = skill.body.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const match = WINDOWS_PATH_PATTERN.exec(lines[index]);
        if (!match) continue;
        return [{
          message: `Windows-style path "${match[1]}" found.`,
          hint: 'Use forward slashes, for example reference/guide.md.',
          line: skill.bodyStartLine + index,
        }];
      }
      return [];
    },
  },
  {
    id: 'unfinished-content',
    title: 'Unfinished content marker',
    defaultSeverity: 'info',
    description: 'Suggests removing TODO, TBD, FIXME, or XXX before publishing.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const lines = skill.body.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const match = UNFINISHED_PATTERN.exec(lines[index]);
        if (!match) continue;
        return [{
          message: `Unfinished marker "${match[0]}" found in the skill body.`,
          hint: 'Resolve or remove it before publishing the skill.',
          line: skill.bodyStartLine + index,
        }];
      }
      return [];
    },
  },
];
