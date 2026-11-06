import fs from 'node:fs';
import { parseSkill } from './frontmatter.js';
import { rules } from './rules/index.js';
import { scoreFindings, summarize } from './score.js';
import { relativeTo } from './utils.js';

const FRONTMATTER_RULE_IDS = {
  missing: 'frontmatter-missing',
  bom: 'frontmatter-bom',
  'not-object': 'frontmatter-not-mapping',
  invalid: 'frontmatter-yaml',
};

const SEVERITY_ORDER = {
  error: 0,
  warning: 1,
  info: 2,
};

const FRONTMATTER_HINTS = {
  missing: 'Start the file with a --- line, the YAML frontmatter, and a closing --- line.',
  bom: 'Save the file as UTF-8 without a BOM so --- is the literal first line.',
  'not-object': 'Frontmatter must be a YAML mapping such as "name: my-skill".',
  invalid: 'Fix the YAML syntax between the opening and closing --- lines.',
};

/**
 * @param {import('./types.js').Skill} skill
 * @param {Record<string, string>} [ruleOverrides]
 * @returns {import('./types.js').SkillResult}
 */
export function lintSkill(skill, ruleOverrides = {}) {
  /** @type {import('./types.js').Finding[]} */
  const findings = [];

  if (skill.frontmatterError) {
    const { code, message, line } = skill.frontmatterError;
    findings.push({
      ruleId: FRONTMATTER_RULE_IDS[code] ?? 'frontmatter-yaml',
      severity: 'error',
      message,
      hint: FRONTMATTER_HINTS[code],
      line,
      file: skill.filePath,
    });
  }

  for (const rule of rules) {
    const override = ruleOverrides[rule.id];
    if (override === 'off') continue;

    let produced;
    try {
      produced = rule.check({ skill });
    } catch (error) {
      findings.push({
        ruleId: 'internal-error',
        severity: 'error',
        message: `Rule "${rule.id}" crashed: ${error instanceof Error ? error.message : String(error)}`,
        hint: 'This is a SkillProof bug. Please report it with the skill file that triggered it.',
        file: skill.filePath,
      });
      continue;
    }

    if (produced === null || produced === undefined) continue;
    const items = Array.isArray(produced) ? produced : [produced];

    for (const item of items) {
      if (!item || typeof item.message !== 'string' || item.message.trim() === '') continue;
      findings.push({
        ruleId: rule.id,
        severity: override ?? item.severity ?? rule.defaultSeverity,
        message: item.message,
        hint: item.hint,
        line: Number.isInteger(item.line) && item.line > 0 ? item.line : undefined,
        file: item.file ?? skill.filePath,
      });
    }
  }

  findings.sort((left, right) => {
    const leftLine = left.line ?? Number.POSITIVE_INFINITY;
    const rightLine = right.line ?? Number.POSITIVE_INFINITY;
    if (leftLine !== rightLine) return leftLine - rightLine;
    const severity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severity !== 0) return severity;
    return left.ruleId.localeCompare(right.ruleId);
  });

  const summary = {
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
    info: findings.filter((finding) => finding.severity === 'info').length,
  };
  const { score, grade } = scoreFindings(findings);

  return {
    filePath: skill.filePath,
    path: relativeTo(process.cwd(), skill.filePath),
    name: skill.name,
    score,
    grade,
    summary,
    findings,
  };
}

/**
 * Read and lint a set of SKILL.md files.
 *
 * @param {string[]} filePaths
 * @param {{cwd?: string, ruleOverrides?: Record<string, string>}} [options]
 * @returns {{results: import('./types.js').SkillResult[], summary: import('./types.js').ReportSummary}}
 */
export function lintSkillFiles(filePaths, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const results = filePaths.map((filePath) => {
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      throw new Error(`Cannot read ${filePath}: ${error.message}`);
    }

    const skill = parseSkill(raw, filePath);
    const result = lintSkill(skill, options.ruleOverrides ?? {});
    result.path = relativeTo(cwd, filePath);
    return result;
  });

  return { results, summary: summarize(results) };
}
