import fs from 'node:fs';
import { ConfigError, CONFIG_FILENAME, loadConfig } from './config.js';
import { DiscoveryError, discoverSkillFiles } from './discover.js';
import { lintSkillFiles } from './lint.js';
import { rules } from './rules/index.js';
import { formatGithub, formatGithubError } from './reporters/github.js';
import { formatJson } from './reporters/json.js';
import { formatPretty } from './reporters/pretty.js';
import { summarize } from './score.js';

const PACKAGE = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

export const VERSION = PACKAGE.version;
const FORMATS = new Set(['pretty', 'json', 'github']);

class CliError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliError';
  }
}

/**
 * @param {string} text
 * @returns {[string, string|null]}
 */
function splitOption(text) {
  const index = text.indexOf('=');
  if (index === -1) return [text, null];
  return [text.slice(0, index), text.slice(index + 1)];
}

/**
 * @param {string} value
 * @param {string} flag
 * @param {{integer?: boolean, min?: number, max?: number}} [bounds]
 * @returns {number}
 */
function parseNumber(value, flag, bounds = {}) {
  const number = Number(value);
  const { integer = false, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = bounds;
  if (value.trim() === '' || !Number.isFinite(number) || (integer && !Number.isInteger(number)) || number < min || number > max) {
    const range = Number.isFinite(min) && Number.isFinite(max) ? ` between ${min} and ${max}` : '';
    throw new CliError(`${flag} expects ${integer ? 'an integer' : 'a number'}${range}.`);
  }
  return number;
}

/**
 * @param {string[]} argv
 * @returns {{
 *   format: "pretty"|"json"|"github",
 *   strict: boolean|undefined,
 *   minScore: number|undefined,
 *   maxWarnings: number|undefined,
 *   exclude: string[],
 *   configPath: string|null,
 *   allowEmpty: boolean,
 *   noColor: boolean,
 *   help: boolean,
 *   version: boolean,
 *   listRules: boolean,
 *   paths: string[]
 * }}
 */
export function parseArgs(argv) {
  const options = {
    format: null,
    strict: undefined,
    minScore: undefined,
    maxWarnings: undefined,
    exclude: [],
    configPath: null,
    allowEmpty: false,
    noColor: false,
    help: false,
    version: false,
    listRules: false,
    paths: [],
  };

  let jsonAlias = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--') {
      options.paths.push(...argv.slice(index + 1));
      break;
    }

    if (!argument.startsWith('-') || argument === '-') {
      options.paths.push(argument);
      continue;
    }

    const [name, inline] = argument.startsWith('--') ? splitOption(argument) : [argument, null];
    const takeValue = () => {
      if (inline !== null) return inline;
      index += 1;
      if (index >= argv.length) throw new CliError(`${name} requires a value.`);
      return argv[index];
    };
    const rejectValue = () => {
      if (inline !== null) throw new CliError(`${name} does not take a value.`);
    };

    switch (name) {
      case '--help':
      case '-h':
        rejectValue();
        options.help = true;
        break;
      case '--version':
      case '-v':
        rejectValue();
        options.version = true;
        break;
      case '--json':
        rejectValue();
        jsonAlias = true;
        break;
      case '--format':
        options.format = takeValue();
        break;
      case '--strict':
        rejectValue();
        options.strict = true;
        break;
      case '--no-strict':
        rejectValue();
        options.strict = false;
        break;
      case '--min-score':
        options.minScore = parseNumber(takeValue(), '--min-score', { min: 0, max: 100 });
        break;
      case '--max-warnings':
        options.maxWarnings = parseNumber(takeValue(), '--max-warnings', { integer: true, min: 0 });
        break;
      case '--exclude': {
        const value = takeValue();
        if (value.trim() === '') throw new CliError('--exclude requires a non-empty glob.');
        options.exclude.push(value);
        break;
      }
      case '--config': {
        const value = takeValue();
        if (value.trim() === '') throw new CliError('--config requires a path.');
        options.configPath = value;
        break;
      }
      case '--allow-empty':
        rejectValue();
        options.allowEmpty = true;
        break;
      case '--no-color':
        rejectValue();
        options.noColor = true;
        break;
      case '--list-rules':
        rejectValue();
        options.listRules = true;
        break;
      default:
        throw new CliError(`Unknown option: ${name}`);
    }
  }

  if (jsonAlias) {
    if (options.format !== null && options.format !== 'json') {
      throw new CliError('--json cannot be combined with a non-json --format.');
    }
    options.format = 'json';
  }

  if (options.format === null) options.format = 'pretty';
  if (!FORMATS.has(options.format)) {
    throw new CliError(`--format must be one of: ${[...FORMATS].join(', ')}.`);
  }

  return options;
}

/**
 * @returns {string}
 */
export function helpText() {
  return `Usage: skillproof [options] [paths...]

Lint and score Claude Code Agent Skills.

Arguments:
  paths                 SKILL.md files or directories to scan (default: .)

Options:
  --format <format>     Output format: pretty, json, or github (default: pretty)
  --json                Shorthand for --format json
  --strict              Treat warnings as failures
  --no-strict           Do not fail on warnings
  --min-score <n>       Fail when the overall score is below n (0-100)
  --max-warnings <n>    Fail when there are more than n warnings
  --exclude <glob>      Skip matching paths (repeatable)
  --config <path>       Use a specific config file
  --allow-empty         Exit 0 when no SKILL.md files are found
  --no-color            Disable ANSI colors
  --list-rules          List every rule and exit
  --version             Print the version and exit
  --help                Show this help and exit

Config:
  ${CONFIG_FILENAME} in the current directory can set exclude, rules,
  strict, minScore, and maxWarnings. Command-line values win.

Examples:
  skillproof .
  skillproof .claude/skills --strict --min-score 90
  skillproof --format json
  skillproof --format github
`;
}

/**
 * @returns {string}
 */
export function rulesText() {
  const sorted = [...rules].sort((left, right) => left.id.localeCompare(right.id));
  const lines = [
    `SkillProof rules (${sorted.length})`,
    '',
    ...sorted.map((rule) => `${rule.id.padEnd(30)} ${rule.defaultSeverity.padEnd(8)} ${rule.title}`),
    '',
    'Override severity with .skillproofrc.json: { "rules": { "rule-id": "off" } }',
    '',
  ];
  return lines.join('\n');
}

/**
 * @param {string} message
 * @param {"pretty"|"json"|"github"} format
 * @param {{stdout: {write: Function}, stderr: {write: Function}}} io
 * @returns {number}
 */
function fail(message, format, io) {
  if (format === 'github') {
    io.stdout.write(formatGithubError(message));
  } else {
    io.stderr.write(`skillproof: ${message}\n`);
  }
  return 2;
}

/**
 * @param {import('./types.js').Report} report
 * @param {"pretty"|"json"|"github"} format
 * @param {boolean} color
 * @param {{stdout: {write: Function}}} io
 * @returns {void}
 */
function writeReport(report, format, color, io) {
  if (format === 'json') {
    io.stdout.write(formatJson(report));
  } else if (format === 'github') {
    io.stdout.write(formatGithub(report));
  } else {
    io.stdout.write(formatPretty(report, { color }));
  }
}

/**
 * Run the CLI. Kept synchronous so tests can call it in-process.
 *
 * @param {string[]} [argv]
 * @param {{cwd?: string, stdout?: {write: Function, isTTY?: boolean}, stderr?: {write: Function}, env?: Record<string, string|undefined>}} [io]
 * @returns {number} Exit code: 0 clean, 1 lint failure, 2 usage/config/discovery error.
 */
export function run(argv = process.argv.slice(2), io = {}) {
  const cwd = io.cwd ?? process.cwd();
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;
  const streams = { stdout, stderr };

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 'pretty', streams);
  }

  if (options.help) {
    stdout.write(helpText());
    return 0;
  }

  if (options.version) {
    stdout.write(`skillproof ${VERSION}\n`);
    return 0;
  }

  if (options.listRules) {
    stdout.write(rulesText());
    return 0;
  }

  let config;
  try {
    config = loadConfig({ cwd, configPath: options.configPath });
  } catch (error) {
    const message = error instanceof ConfigError ? error.message : String(error);
    return fail(message, options.format, streams);
  }

  const strict = options.strict ?? config.strict;
  const minScore = options.minScore ?? config.minScore;
  const maxWarnings = options.maxWarnings ?? config.maxWarnings;
  const exclude = [...config.exclude, ...options.exclude];
  const paths = options.paths.length > 0 ? options.paths : ['.'];

  let files;
  try {
    files = discoverSkillFiles(paths, { cwd, exclude });
  } catch (error) {
    const message = error instanceof DiscoveryError ? error.message : String(error);
    return fail(message, options.format, streams);
  }

  if (files.length === 0) {
    if (!options.allowEmpty) {
      return fail(
        `No SKILL.md files found in ${paths.join(', ')}. Pass --allow-empty to permit this.`,
        options.format,
        streams,
      );
    }

    writeReport({
      toolVersion: VERSION,
      cwd,
      results: [],
      summary: summarize([]),
      ok: true,
      failureReasons: [],
    }, options.format, false, streams);
    return 0;
  }

  let linted;
  try {
    linted = lintSkillFiles(files, { cwd, ruleOverrides: config.rules });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), options.format, streams);
  }

  const failureReasons = [];
  if (linted.summary.errors > 0) {
    failureReasons.push(`${linted.summary.errors} error(s)`);
  }
  if (strict && linted.summary.warnings > 0) {
    failureReasons.push(`${linted.summary.warnings} warning(s) in strict mode`);
  }
  if (maxWarnings !== null && linted.summary.warnings > maxWarnings) {
    failureReasons.push(`${linted.summary.warnings} warning(s) exceeds max-warnings ${maxWarnings}`);
  }
  if (linted.summary.score < minScore) {
    failureReasons.push(`score ${linted.summary.score} is below min-score ${minScore}`);
  }

  const report = {
    toolVersion: VERSION,
    cwd,
    results: linted.results,
    summary: linted.summary,
    ok: failureReasons.length === 0,
    failureReasons,
  };

  const color = options.noColor
    ? false
    : (Boolean(env.FORCE_COLOR && env.FORCE_COLOR !== '0') || (Boolean(stdout.isTTY) && !env.NO_COLOR));

  writeReport(report, options.format, color, streams);
  return report.ok ? 0 : 1;
}
