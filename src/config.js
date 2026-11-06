import fs from 'node:fs';
import path from 'node:path';
import { rulesById } from './rules/index.js';
import { isPlainObject } from './utils.js';

export const CONFIG_FILENAME = '.skillproofrc.json';

const SEVERITIES = new Set(['off', 'info', 'warning', 'error']);
const ROOT_KEYS = new Set(['$schema', 'exclude', 'rules', 'strict', 'minScore', 'maxWarnings']);

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * @returns {{exclude: string[], rules: Record<string, string>, strict: boolean, minScore: number, maxWarnings: number|null}}
 */
export function defaultConfig() {
  return {
    exclude: [],
    rules: {},
    strict: false,
    minScore: 0,
    maxWarnings: null,
  };
}

/**
 * Load `.skillproofrc.json` from the invocation directory, or an explicit path.
 * A missing default config is not an error; a missing explicit config is.
 *
 * @param {{cwd?: string, configPath?: string|null}} [options]
 * @returns {{exclude: string[], rules: Record<string, string>, strict: boolean, minScore: number, maxWarnings: number|null}}
 */
export function loadConfig(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const explicit = options.configPath ?? null;
  let configPath = null;

  if (explicit) {
    configPath = path.resolve(cwd, explicit);
    if (!fs.existsSync(configPath)) {
      throw new ConfigError(`Config file not found: ${explicit}`);
    }
  } else {
    const candidate = path.join(cwd, CONFIG_FILENAME);
    if (fs.existsSync(candidate)) configPath = candidate;
  }

  if (!configPath) return defaultConfig();

  let text;
  try {
    text = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    throw new ConfigError(`Cannot read config ${configPath}: ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`Invalid JSON in ${configPath}: ${error.message}`);
  }

  validateConfig(parsed, configPath);
  return {
    exclude: [...(parsed.exclude ?? [])],
    rules: { ...(parsed.rules ?? {}) },
    strict: parsed.strict ?? false,
    minScore: parsed.minScore ?? 0,
    maxWarnings: parsed.maxWarnings ?? null,
  };
}

/**
 * @param {unknown} config
 * @param {string} [source]
 * @returns {void}
 */
export function validateConfig(config, source = CONFIG_FILENAME) {
  if (!isPlainObject(config)) {
    throw new ConfigError(`${source} must contain a JSON object.`);
  }

  for (const key of Object.keys(config)) {
    if (!ROOT_KEYS.has(key)) {
      throw new ConfigError(`${source}: unknown option "${key}".`);
    }
  }

  if (config.exclude !== undefined) {
    if (!Array.isArray(config.exclude) || config.exclude.some((value) => typeof value !== 'string' || value === '')) {
      throw new ConfigError(`${source}: "exclude" must be an array of non-empty glob strings.`);
    }
  }

  if (config.rules !== undefined) {
    if (!isPlainObject(config.rules)) {
      throw new ConfigError(`${source}: "rules" must be an object.`);
    }
    for (const [ruleId, severity] of Object.entries(config.rules)) {
      if (!rulesById.has(ruleId)) {
        throw new ConfigError(`${source}: unknown rule "${ruleId}". Run "skillproof --list-rules" to see valid IDs.`);
      }
      if (!SEVERITIES.has(severity)) {
        throw new ConfigError(`${source}: severity for "${ruleId}" must be one of off, info, warning, error.`);
      }
    }
  }

  if (config.strict !== undefined && typeof config.strict !== 'boolean') {
    throw new ConfigError(`${source}: "strict" must be a boolean.`);
  }

  if (config.minScore !== undefined && (typeof config.minScore !== 'number' || !Number.isFinite(config.minScore) || config.minScore < 0 || config.minScore > 100)) {
    throw new ConfigError(`${source}: "minScore" must be a number between 0 and 100.`);
  }

  if (config.maxWarnings !== undefined && config.maxWarnings !== null) {
    if (!Number.isInteger(config.maxWarnings) || config.maxWarnings < 0) {
      throw new ConfigError(`${source}: "maxWarnings" must be a non-negative integer or null.`);
    }
  }
}
