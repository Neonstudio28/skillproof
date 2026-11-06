import { relativeTo } from '../utils.js';

/**
 * @param {import('../types.js').Finding} finding
 * @param {import('../types.js').SkillResult} result
 * @param {string} cwd
 * @returns {Record<string, unknown>}
 */
function serializeFinding(finding, result, cwd) {
  const output = {
    ruleId: finding.ruleId,
    severity: finding.severity,
    message: finding.message,
  };
  if (finding.hint) output.hint = finding.hint;
  if (finding.line) output.line = finding.line;
  output.file = finding.file ? relativeTo(cwd, finding.file) : result.path;
  return output;
}

/**
 * Stable machine-readable output for CI and editor integrations.
 * @param {import('../types.js').Report} report
 * @returns {string}
 */
export function formatJson(report) {
  const payload = {
    tool: 'skillproof',
    version: report.toolVersion,
    ok: report.ok,
    summary: report.summary,
    failureReasons: report.failureReasons,
    skills: report.results.map((result) => ({
      path: result.path,
      name: result.name,
      score: result.score,
      grade: result.grade,
      summary: result.summary,
      findings: result.findings.map((finding) => serializeFinding(finding, result, report.cwd)),
    })),
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}
