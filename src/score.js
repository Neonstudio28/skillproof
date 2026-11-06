/**
 * Scoring is deliberately simple and transparent:
 * start at 100, subtract 15 per error, 5 per warning, and 0 per info.
 * The overall score is the unweighted mean of each skill's score.
 */

export const SEVERITY_WEIGHTS = Object.freeze({
  error: 15,
  warning: 5,
  info: 0,
});

/**
 * @param {number} score
 * @returns {"A"|"B"|"C"|"D"|"F"}
 */
export function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * @param {import('./types.js').Finding[]} findings
 * @returns {{score: number, grade: "A"|"B"|"C"|"D"|"F"}}
 */
export function scoreFindings(findings) {
  let score = 100;
  for (const finding of findings) {
    score -= SEVERITY_WEIGHTS[finding.severity] ?? 0;
  }
  score = Math.max(0, Math.min(100, score));
  return { score, grade: gradeFor(score) };
}

/**
 * @param {import('./types.js').SkillResult[]} results
 * @returns {import('./types.js').ReportSummary}
 */
export function summarize(results) {
  let errors = 0;
  let warnings = 0;
  let info = 0;

  for (const result of results) {
    errors += result.summary.errors;
    warnings += result.summary.warnings;
    info += result.summary.info;
  }

  const score = results.length === 0
    ? 100
    : Math.round(results.reduce((total, result) => total + result.score, 0) / results.length);

  return {
    skills: results.length,
    errors,
    warnings,
    info,
    score,
    grade: gradeFor(score),
  };
}
