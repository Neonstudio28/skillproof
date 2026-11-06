import { relativeTo } from '../utils.js';

const COMMAND_FOR_SEVERITY = {
  error: 'error',
  warning: 'warning',
  info: 'notice',
};

/**
 * Escape a workflow-command data value.
 * @param {string} value
 * @returns {string}
 */
export function escapeData(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

/**
 * Escape a workflow-command property value.
 * @param {string} value
 * @returns {string}
 */
export function escapeProperty(value) {
  return escapeData(value)
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C');
}

/**
 * @param {string} message
 * @returns {string}
 */
export function formatGithubError(message) {
  return `::error title=SkillProof::${escapeData(message)}\n`;
}

/**
 * GitHub Actions workflow commands. Actions turns these into inline annotations.
 * @param {import('../types.js').Report} report
 * @returns {string}
 */
export function formatGithub(report) {
  const lines = [];

  for (const result of report.results) {
    for (const finding of result.findings) {
      const file = finding.file ? relativeTo(report.cwd, finding.file) : result.path;
      const properties = [`file=${escapeProperty(file)}`];
      if (finding.line) properties.push(`line=${finding.line}`);
      properties.push(`title=${escapeProperty(`skillproof/${finding.ruleId}`)}`);
      const message = finding.hint ? `${finding.message} Hint: ${finding.hint}` : finding.message;
      lines.push(`::${COMMAND_FOR_SEVERITY[finding.severity]} ${properties.join(',')}::${escapeData(message)}`);
    }
  }

  const summary = `${report.summary.skills} skill(s), score ${report.summary.score}/100 (${report.summary.grade}), ${report.summary.errors} error(s), ${report.summary.warnings} warning(s), ${report.summary.info} info`;
  if (report.ok) {
    lines.push(`::notice title=SkillProof::${escapeData(summary)}`);
  } else {
    lines.push(`::error title=SkillProof::${escapeData(`${summary}. ${report.failureReasons.join('; ')}`)}`);
  }

  return `${lines.join('\n')}\n`;
}
