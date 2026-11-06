import { isPlainObject, lineOfField } from '../utils.js';

const KNOWN_FIELDS = new Set([
  'name',
  'description',
  'when_to_use',
  'argument-hint',
  'arguments',
  'disable-model-invocation',
  'user-invocable',
  'allowed-tools',
  'disallowed-tools',
  'model',
  'effort',
  'context',
  'agent',
  'background',
  'hooks',
  'paths',
  'shell',
  'metadata',
  'license',
  'compatibility',
]);

const STRING_FIELDS = new Set([
  'name',
  'description',
  'when_to_use',
  'argument-hint',
  'model',
  'agent',
  'license',
  'compatibility',
  'context',
  'effort',
  'shell',
]);

const BOOLEAN_FIELDS = new Set([
  'disable-model-invocation',
  'user-invocable',
  'background',
]);

const STRING_LIST_FIELDS = new Set([
  'allowed-tools',
  'disallowed-tools',
  'arguments',
  'paths',
]);

const OBJECT_FIELDS = new Set(['hooks', 'metadata']);
const EFFORT_VALUES = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const BOOLEAN_STRINGS = new Set(['true', 'false', 'yes', 'no', 'on', 'off', '1', '0']);

const TRIGGER_PATTERNS = [
  /\buse (?:this|when|for|it|the skill)\b/i,
  /\bwhen (?:the )?user\b/i,
  /\bwhen (?:you|working|asked|the task|using)\b/i,
  /\bwhenever\b/i,
  /\btrigger(?:s|ed)?\b/i,
  /\binvoke (?:this|when|the skill)\b/i,
  /\bif (?:the )?user\b/i,
];

const THIRD_PERSON_PATTERN = /\b(?:I|me|my|mine|we|us|our|ours|you|your|yours)\b/i;
const XML_TAG_PATTERN = /<[A-Za-z][^<>]*>/;
const RESERVED_NAME_PATTERN = /(^|-)(anthropic|claude)(-|$)/i;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isBooleanLike(value) {
  if (typeof value === 'boolean') return true;
  if (value === 0 || value === 1) return true;
  return typeof value === 'string' && BOOLEAN_STRINGS.has(value.toLowerCase());
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * @param {import('../types.js').Skill} skill
 * @returns {Record<string, unknown>}
 */
function dataFor(skill) {
  return isPlainObject(skill.data) ? skill.data : {};
}

/**
 * @param {import('../types.js').Skill} skill
 * @param {string} field
 * @param {string} message
 * @param {string} [hint]
 * @returns {import('../types.js').RuleFinding}
 */
function finding(skill, field, message, hint) {
  return { message, hint, line: lineOfField(skill, field) };
}

/** @type {import('../types.js').Rule[]} */
export const metadataRules = [
  {
    id: 'frontmatter-unknown-field',
    title: 'Unknown frontmatter field',
    defaultSeverity: 'warning',
    description: 'Flags frontmatter keys Claude Code does not recognize, which are silently ignored.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const findings = [];
      for (const field of Object.keys(dataFor(skill))) {
        if (KNOWN_FIELDS.has(field)) continue;
        findings.push(finding(
          skill,
          field,
          `Unknown frontmatter field "${field}".`,
          'Claude Code ignores unknown fields. Check the spelling or remove the field.',
        ));
      }
      return findings;
    },
  },
  {
    id: 'field-type',
    title: 'Frontmatter field type',
    defaultSeverity: 'error',
    description: 'Validates the YAML type and accepted values of every documented frontmatter field.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const data = dataFor(skill);
      const findings = [];

      for (const [field, value] of Object.entries(data)) {
        if (STRING_FIELDS.has(field) && typeof value !== 'string') {
          findings.push(finding(
            skill,
            field,
            `"${field}" must be a string, not ${Array.isArray(value) ? 'an array' : typeof value}.`,
          ));
          continue;
        }

        if (BOOLEAN_FIELDS.has(field) && !isBooleanLike(value)) {
          findings.push(finding(
            skill,
            field,
            `"${field}" must be a boolean (true/false, yes/no, on/off, or 1/0).`,
          ));
          continue;
        }

        if (STRING_LIST_FIELDS.has(field)
          && typeof value !== 'string'
          && !isStringArray(value)) {
          findings.push(finding(
            skill,
            field,
            `"${field}" must be a string or an array of strings.`,
          ));
          continue;
        }

        if (OBJECT_FIELDS.has(field) && !isPlainObject(value)) {
          findings.push(finding(
            skill,
            field,
            `"${field}" must be a YAML mapping.`,
          ));
          continue;
        }

        if (field === 'context' && value !== 'fork') {
          findings.push(finding(
            skill,
            field,
            '"context" must be "fork" when set.',
            'Remove the field for normal inline execution.',
          ));
        }

        if (field === 'effort' && typeof value === 'string' && !EFFORT_VALUES.has(value)) {
          findings.push(finding(
            skill,
            field,
            `"effort" must be one of: ${[...EFFORT_VALUES].join(', ')}.`,
          ));
        }

        if (field === 'compatibility' && typeof value === 'string' && value.length > 500) {
          findings.push(finding(
            skill,
            field,
            `"compatibility" is ${value.length} characters; the maximum is 500.`,
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'fork-fields',
    title: 'Fork-only fields without context',
    defaultSeverity: 'warning',
    description: 'Warns when agent or background is set without context: fork.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const data = dataFor(skill);
      if (data.context === 'fork') return [];
      if (!Object.hasOwn(data, 'agent') && !Object.hasOwn(data, 'background')) return [];
      return [{
        message: '"agent" and "background" only take effect when context is set to fork.',
        hint: 'Add "context: fork" or remove the fork-only fields.',
        line: lineOfField(skill, Object.hasOwn(data, 'agent') ? 'agent' : 'background'),
      }];
    },
  },
  {
    id: 'name-required',
    title: 'Name is required',
    defaultSeverity: 'error',
    description: 'Requires a non-empty frontmatter name for portable Agent Skills.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const { name } = dataFor(skill);
      if (name !== undefined && typeof name !== 'string') return [];
      if (typeof name === 'string' && name.trim() !== '') return [];
      return [finding(
        skill,
        'name',
        'A portable skill needs a non-empty "name".',
        'Claude Code falls back to the directory name, but other Agent Skills hosts require the field.',
      )];
    },
  },
  {
    id: 'name-format',
    title: 'Name format',
    defaultSeverity: 'error',
    description: 'Enforces the Agent Skills name grammar: lowercase words separated by single hyphens.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const { name } = dataFor(skill);
      if (typeof name !== 'string' || name.trim() === '') return [];

      if (name.length > 64) {
        return [finding(
          skill,
          'name',
          `Name is ${name.length} characters; the maximum is 64.`,
          'Shorten the name while keeping it descriptive.',
        )];
      }

      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
        let hint = 'Use only lowercase letters, numbers, and hyphens.';
        if (name.startsWith('-') || name.endsWith('-') || name.includes('--')) {
          hint = 'Remove leading, trailing, or consecutive hyphens.';
        } else if (/[A-Z]/.test(name)) {
          hint = 'Lowercase every letter.';
        } else if (/\s/.test(name)) {
          hint = 'Replace spaces with hyphens.';
        }
        return [finding(skill, 'name', `Name "${name}" is not valid.`, hint)];
      }

      return [];
    },
  },
  {
    id: 'name-reserved',
    title: 'Reserved name word',
    defaultSeverity: 'warning',
    description: 'Warns about anthropic or claude in the name, which the portable spec reserves.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const { name } = dataFor(skill);
      if (typeof name !== 'string' || !RESERVED_NAME_PATTERN.test(name)) return [];
      return [finding(
        skill,
        'name',
        `Name "${name}" contains a word reserved by the portable Agent Skills spec.`,
        'Avoid "anthropic" and "claude" in the name. Claude Code itself accepts them.',
      )];
    },
  },
  {
    id: 'name-directory',
    title: 'Name matches directory',
    defaultSeverity: 'warning',
    description: 'Warns when the frontmatter name does not match the parent directory.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const { name } = dataFor(skill);
      if (typeof name !== 'string' || name.trim() === '' || !skill.dirName) return [];
      if (name === skill.dirName) return [];
      return [finding(
        skill,
        'name',
        `Name "${name}" does not match the directory "${skill.dirName}".`,
        'Keep them identical so the /command name is predictable.',
      )];
    },
  },
  {
    id: 'description-required',
    title: 'Description is required',
    defaultSeverity: 'error',
    description: 'Requires a non-empty description so Claude can discover the skill.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const { description } = dataFor(skill);
      if (description !== undefined && typeof description !== 'string') return [];
      if (typeof description === 'string' && description.trim() !== '') return [];
      return [finding(
        skill,
        'description',
        'A skill needs a non-empty "description" so Claude can discover it.',
        'Say what the skill does and when to use it.',
      )];
    },
  },
  {
    id: 'description-length',
    title: 'Description length',
    defaultSeverity: 'error',
    description: 'Enforces the 1,024-character description limit.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const { description } = dataFor(skill);
      if (typeof description !== 'string' || description.length <= 1024) return [];
      return [finding(
        skill,
        'description',
        `Description is ${description.length} characters; the maximum is 1,024.`,
        'Move implementation details into the skill body.',
      )];
    },
  },
  {
    id: 'description-truncation',
    title: 'Description listing truncation',
    defaultSeverity: 'warning',
    description: 'Warns when description plus when_to_use exceeds Claude Code\'s 1,536-character listing cap.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const data = dataFor(skill);
      if (typeof data.description !== 'string') return [];
      const combined = data.description + (typeof data.when_to_use === 'string' ? data.when_to_use : '');
      if (combined.length <= 1536) return [];
      return [finding(
        skill,
        'description',
        `Description plus when_to_use is ${combined.length} characters; Claude Code truncates the listing at 1,536.`,
        'Put the key use case first and keep the combined text shorter.',
      )];
    },
  },
  {
    id: 'description-trigger',
    title: 'Description states when to use',
    defaultSeverity: 'warning',
    description: 'Checks that the description explains when Claude should load the skill.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const data = dataFor(skill);
      if (typeof data.description !== 'string' || data.description.trim() === '') return [];
      const combined = `${data.description} ${typeof data.when_to_use === 'string' ? data.when_to_use : ''}`;
      if (TRIGGER_PATTERNS.some((pattern) => pattern.test(combined))) return [];
      return [finding(
        skill,
        'description',
        'Description does not say when to use the skill.',
        'Add a clause such as "Use when the user asks about ...".',
      )];
    },
  },
  {
    id: 'description-third-person',
    title: 'Description voice',
    defaultSeverity: 'warning',
    description: 'Requires third-person description voice, as recommended by Anthropic.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const { description } = dataFor(skill);
      if (typeof description !== 'string' || !THIRD_PERSON_PATTERN.test(description)) return [];
      return [finding(
        skill,
        'description',
        'Description uses first- or second-person voice.',
        'Write in third person: "Processes files" instead of "I can process files" or "You can process files".',
      )];
    },
  },
  {
    id: 'description-xml',
    title: 'Description markup',
    defaultSeverity: 'warning',
    description: 'Warns about XML/HTML angle-bracket tags in the description.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const { description } = dataFor(skill);
      if (typeof description !== 'string' || !XML_TAG_PATTERN.test(description)) return [];
      return [finding(
        skill,
        'description',
        'Description contains angle-bracket markup, which the portable spec prohibits.',
        'Use backticks for placeholders such as `filename`.',
      )];
    },
  },
  {
    id: 'reserved-directory',
    title: 'Reserved skill directory',
    defaultSeverity: 'error',
    description: 'Rejects directory names Claude Code reserves for synced skills.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const directory = skill.dirName.toLowerCase();
      if (directory !== 'synced' && directory !== 'anthropic-skills') return [];
      return [{
        message: `Skill directory "${skill.dirName}" is reserved by Claude Code.`,
        hint: 'Rename the directory so Claude Code does not skip the skill.',
        line: 1,
      }];
    },
  },
];
