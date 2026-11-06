import { relativeTo } from '../utils.js';

const ANSI = {
  reset: '\u001B[0m',
  bold: '\u001B[1m',
  dim: '\u001B[2m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  blue: '\u001B[34m',
  cyan: '\u001B[36m',
};

/**
 * @param {string} text
 * @param {keyof typeof ANSI} style
 * @param {boolean} color
 * @returns {string}
 */
function paint(text, style, color) {
  return color ? `${ANSI[style]}${text}${ANSI.reset}` : text;
}

/**
 * @param {"error"|"warning"|"info"} severity
 * @param {boolean} color
 * @returns {string}
 */
function severityLabel(severity, color) {
  if (severity === 'error') return paint('error  ', 'red', color);
  if (severity === 'warning') return paint('warning', 'yellow', color);
  return paint('info   ', 'blue', color);
}

/**
 * @param {string} path
 * @param {string} name
 * @param {string} score
 * @param {string} grade
 * @param {boolean} color
 * @returns {string}
 */
function skillHeading(path, name, score, grade, color) {
  return `${paint(path, 'bold', color)}  ${paint(name, 'cyan', color)}  ${score} ${grade}`;
}

/**
 * @param {import('../types.js').Report} report
 * @param {{color?: boolean}} [options]
 * @returns {string}
 */
export function formatPretty(report, options = {}) {
  const color = options.color ?? false;
  const lines = [];

  lines.push(`${paint('SkillProof', 'bold', color)} ${report.toolVersion}  ${paint('·', 'dim', color)}  ${report.summary.skills} skill${report.summary.skills === 1 ? '' : 's'}`);

  if (report.results.length === 0) {
    lines.push('');
    lines.push('No SKILL.md files found (allowed by --allow-empty).');
    return `${lines.join('\n')}\n`;
  }

  lines.push('');

  for (const result of report.results) {
    const score = `${result.score}/100`;
    const grade = result.grade;
    const icon = result.findings.length === 0 ? paint('✔', 'green', color) : paint('✖', 'red', color);
    lines.push(`${icon} ${skillHeading(result.path, result.name, score, grade, color)}`);

    for (const finding of result.findings) {
      const location = finding.line ? paint(` (line ${finding.line})`, 'dim', color) : '';
      lines.push(`    ${severityLabel(finding.severity, color)}  ${paint(finding.ruleId, 'dim', color)}  ${finding.message}${location}`);
      if (finding.hint) {
        lines.push(`             ${paint(`↳ ${finding.hint}`, 'dim', color)}`);
      }
    }
  }

  lines.push('');
  const counts = [
    `${report.summary.errors} error${report.summary.errors === 1 ? '' : 's'}`,
    `${report.summary.warnings} warning${report.summary.warnings === 1 ? '' : 's'}`,
    `${report.summary.info} info`,
  ];
  lines.push(`${report.summary.skills} skill${report.summary.skills === 1 ? '' : 's'} · ${counts.join(' · ')}`);

  const scoreColor = report.summary.score >= 90 ? 'green' : report.summary.score >= 70 ? 'yellow' : 'red';
  lines.push(`Overall score: ${paint(`${report.summary.score}/100 (${report.summary.grade})`, scoreColor, color)}`);

  if (report.ok) {
    lines.push(paint('All checks passed.', 'green', color));
  } else {
    lines.push(paint('Failed:', 'red', color));
    for (const reason of report.failureReasons) {
      lines.push(`  - ${reason}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
