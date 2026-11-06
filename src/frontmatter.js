import path from 'node:path';
import { parseDocument } from 'yaml';
import { isPlainObject } from './utils.js';

const OPENING = '---';
const CLOSING = '---';

/**
 * @param {string} line
 * @returns {string}
 */
function stripCarriageReturn(line) {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

/**
 * @param {string} message
 * @returns {string}
 */
function cleanYamlMessage(message) {
  const firstLine = message.split('\n')[0].trim();
  const withoutLocation = firstLine.replace(/\s+at line \d+, column \d+:?\s*$/, '').trim();
  return /[.!?]$/.test(withoutLocation) ? withoutLocation : `${withoutLocation}.`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
  if (Array.isArray(value)) return 'an array';
  if (value === null) return 'null';
  return `a ${typeof value}`;
}

/**
 * Parse the YAML frontmatter portion of a SKILL.md file.
 *
 * @param {string} raw
 * @returns {{
 *   data: Record<string, unknown>,
 *   raw: string,
 *   startLine: number,
 *   endLine: number,
 *   body: string,
 *   bodyStartLine: number,
 *   error: import('./types.js').FrontmatterError|null
 * }}
 */
export function parseFrontmatter(raw) {
  const hasBom = raw.startsWith('\uFEFF');
  const source = hasBom ? raw.slice(1) : raw;
  const lines = source.split('\n');

  if (stripCarriageReturn(lines[0] ?? '') !== OPENING) {
    return {
      data: {},
      raw: '',
      startLine: 1,
      endLine: 0,
      body: source,
      bodyStartLine: 1,
      error: {
        code: 'missing',
        message: 'SKILL.md must start with YAML frontmatter (--- on the first line).',
        line: 1,
      },
    };
  }

  let closingIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (stripCarriageReturn(lines[index]) === CLOSING) {
      closingIndex = index;
      break;
    }
  }

  if (closingIndex === -1) {
    return {
      data: {},
      raw: '',
      startLine: 2,
      endLine: 0,
      body: '',
      bodyStartLine: lines.length + 1,
      error: {
        code: hasBom ? 'bom' : 'invalid',
        message: hasBom
          ? 'SKILL.md starts with a UTF-8 BOM, so --- is not the first line.'
          : 'Invalid YAML frontmatter: missing closing --- delimiter.',
        line: 1,
      },
    };
  }

  const frontmatterRaw = lines.slice(1, closingIndex).join('\n');
  const body = lines.slice(closingIndex + 1).join('\n');
  const bodyStartLine = closingIndex + 2;
  const baseError = hasBom
    ? {
      code: /** @type {const} */ ('bom'),
      message: 'SKILL.md starts with a UTF-8 BOM, so --- is not the first line.',
      line: 1,
    }
    : null;

  let document;
  try {
    document = parseDocument(frontmatterRaw, {
      uniqueKeys: true,
    });
  } catch (error) {
    return {
      data: {},
      raw: frontmatterRaw,
      startLine: 2,
      endLine: closingIndex + 1,
      body,
      bodyStartLine,
      error: {
        code: 'invalid',
        message: `Invalid YAML frontmatter: ${cleanYamlMessage(error instanceof Error ? error.message : String(error))}`,
        line: 2,
      },
    };
  }

  if (document.errors.length > 0) {
    const yamlError = document.errors[0];
    const linePosition = yamlError.linePos?.[0]?.line;
    return {
      data: {},
      raw: frontmatterRaw,
      startLine: 2,
      endLine: closingIndex + 1,
      body,
      bodyStartLine,
      error: {
        code: 'invalid',
        message: `Invalid YAML frontmatter: ${cleanYamlMessage(yamlError.message)}`,
        line: Number.isInteger(linePosition) ? linePosition + 1 : 2,
      },
    };
  }

  let data;
  try {
    const value = document.toJS({ maxAliasCount: 100 });
    if (value === null || value === undefined) {
      data = {};
    } else if (!isPlainObject(value)) {
      return {
        data: {},
        raw: frontmatterRaw,
        startLine: 2,
        endLine: closingIndex + 1,
        body,
        bodyStartLine,
        error: {
          code: 'not-object',
          message: `Frontmatter must be a YAML mapping, not ${describeType(value)}.`,
          line: 2,
        },
      };
    } else {
      data = value;
    }
  } catch (error) {
    return {
      data: {},
      raw: frontmatterRaw,
      startLine: 2,
      endLine: closingIndex + 1,
      body,
      bodyStartLine,
      error: {
        code: 'invalid',
        message: `Invalid YAML frontmatter: ${cleanYamlMessage(error instanceof Error ? error.message : String(error))}`,
        line: 2,
      },
    };
  }

  return {
    data,
    raw: frontmatterRaw,
    startLine: 2,
    endLine: closingIndex + 1,
    body,
    bodyStartLine,
    error: baseError,
  };
}

/**
 * Parse a complete SKILL.md file into the shared Skill shape.
 *
 * @param {string} raw
 * @param {string} filePath
 * @returns {import('./types.js').Skill}
 */
export function parseSkill(raw, filePath) {
  const absolutePath = path.resolve(filePath);
  const dir = path.dirname(absolutePath);
  const dirName = path.basename(dir);
  const parsed = parseFrontmatter(raw);
  const data = parsed.data ?? {};
  const name = typeof data.name === 'string' && data.name.trim() !== ''
    ? data.name.trim()
    : dirName;

  return {
    filePath: absolutePath,
    dir,
    dirName,
    raw,
    lines: raw.split('\n'),
    body: parsed.body,
    bodyStartLine: parsed.bodyStartLine,
    frontmatterRaw: parsed.raw,
    frontmatterStartLine: parsed.startLine,
    frontmatterEndLine: parsed.endLine,
    data,
    frontmatterError: parsed.error,
    name,
  };
}
