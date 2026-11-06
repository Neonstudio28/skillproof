/**
 * Shared data contracts for SkillProof.
 *
 * This module is intentionally type-only. It is imported nowhere at runtime and
 * exists so every subsystem (parser, rules, reporters) agrees on the same shape.
 * @module types
 */

/**
 * A parsed `SKILL.md` file.
 *
 * @typedef {Object} Skill
 * @property {string} filePath Absolute path to the `SKILL.md` file.
 * @property {string} dir Absolute path to the skill directory.
 * @property {string} dirName Basename of the skill directory.
 * @property {string} raw Full file contents.
 * @property {string[]} lines File contents split on `\n` (a trailing `\r` is retained).
 * @property {string} body Markdown after the closing frontmatter delimiter. Empty when frontmatter is missing or malformed.
 * @property {number} bodyStartLine 1-based line number of the first body line.
 * @property {string} frontmatterRaw Raw YAML between the delimiters. Empty when missing.
 * @property {number} frontmatterStartLine 1-based line number of the first YAML line. 2 for a normal file.
 * @property {number} frontmatterEndLine 1-based line number of the closing delimiter. 0 when missing.
 * @property {Record<string, unknown>} data Parsed YAML mapping. Empty object on failure.
 * @property {FrontmatterError|null} frontmatterError Parse problem, if any.
 * @property {string} name Display name: `data.name` when it is a non-empty string, otherwise `dirName`.
 */

/**
 * @typedef {Object} FrontmatterError
 * @property {"missing"|"invalid"|"not-object"|"bom"} code
 * @property {string} message Human-readable explanation.
 * @property {number} line 1-based line number to report.
 */

/**
 * A single lint result produced by a rule.
 *
 * Rules return findings without `ruleId`, `severity`, or `file`; the lint engine
 * fills those in. A rule may return one finding, an array, or null.
 *
 * @typedef {Object} RuleFinding
 * @property {string} message What is wrong and, when practical, how to fix it.
 * @property {string} [hint] Optional second line with a concrete suggestion.
 * @property {number} [line] 1-based line number.
 * @property {string} [file] Absolute path when the finding belongs to a bundled file.
 * @property {"error"|"warning"|"info"} [severity] Per-finding override. Use sparingly.
 */

/**
 * A fully resolved finding emitted by the lint engine.
 *
 * @typedef {Object} Finding
 * @property {string} ruleId Stable kebab-case rule identifier.
 * @property {"error"|"warning"|"info"} severity Effective severity after config overrides.
 * @property {string} message
 * @property {string} [hint]
 * @property {number} [line]
 * @property {string} file Absolute path to the file the finding belongs to.
 */

/**
 * A lint rule.
 *
 * `check` must be synchronous, must not throw for malformed input, and must not
 * read files outside the skill directory. Rules that depend on frontmatter must
 * return an empty result when `skill.frontmatterError` is set.
 *
 * @typedef {Object} Rule
 * @property {string} id
 * @property {string} title Short human-readable title.
 * @property {"error"|"warning"|"info"} defaultSeverity
 * @property {string} description One sentence explaining the rule.
 * @property {(context: { skill: Skill }) => RuleFinding[]|RuleFinding|null} check
 */

/**
 * Lint result for one skill.
 *
 * @typedef {Object} SkillResult
 * @property {string} filePath Absolute path.
 * @property {string} path Path relative to the invocation directory, POSIX separators.
 * @property {string} name
 * @property {number} score 0-100.
 * @property {"A"|"B"|"C"|"D"|"F"} grade
 * @property {{errors: number, warnings: number, info: number}} summary
 * @property {Finding[]} findings
 */

/**
 * Aggregate counts and score.
 *
 * @typedef {Object} ReportSummary
 * @property {number} skills
 * @property {number} errors
 * @property {number} warnings
 * @property {number} info
 * @property {number} score
 * @property {"A"|"B"|"C"|"D"|"F"} grade
 */

/**
 * Everything a reporter needs. Built by the CLI, consumed by reporters.
 *
 * @typedef {Object} Report
 * @property {string} toolVersion
 * @property {string} cwd
 * @property {SkillResult[]} results
 * @property {ReportSummary} summary
 * @property {boolean} ok
 * @property {string[]} failureReasons
 */

export {};
