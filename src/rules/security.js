import { lineOfField } from '../utils.js';
import { maskFencedCodeLines } from './references.js';

const SECRET_PATTERNS = [
  { name: 'Anthropic API key', pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI API key', pattern: /sk-proj-[A-Za-z0-9_-]{20,}/ },
  { name: 'GitHub token', pattern: /\bghp_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub fine-grained token', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'GitLab token', pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'npm token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

const POSSIBLE_SECRET_PATTERN = /\b(?:api[_-]?key|secret|token|password|passwd|access[_-]?key)\b\s*[:=]\s*(?:["']([^"']{16,})["']|([A-Za-z0-9_\-./+=]{16,}))/i;
const PLACEHOLDER_PATTERN = /(?:your|example|placeholder|xxx|redacted|change[-_]?me|dummy|test|fake|sample|insert|todo|\.\.\.)/i;
const ENV_REFERENCE_PATTERN = /^(?:process\.env|os\.environ|env\.|\$\{|\$[A-Z_]|[A-Z][A-Z0-9_]{2,}$)/;

const DANGEROUS_PATTERNS = [
  { label: 'downloads and executes a remote script', pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|k|da)?sh\b/i },
  { label: 'evaluates a remote script', pattern: /\beval\s+["']?\$\(\s*(?:curl|wget)\b/i },
  { label: 'decodes and executes base64 content', pattern: /\bbase64\s+(?:-d|--decode)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|k|da)?sh\b/i },
  { label: 'deletes the filesystem root or home directory', pattern: /\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+(?:\/|~)(?:\s|$)/ },
  { label: 'deletes the contents of the filesystem root', pattern: /\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+\/\*(?:\s|$)/ },
  { label: 'contains a fork bomb', pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/ },
  { label: 'writes directly to a block device', pattern: /\bdd\b[^\n]*\bof=\/dev\/(?:sd|disk|nvme)/i },
  { label: 'formats a block device', pattern: /\bmkfs(?:\.\w+)?\b[^\n]*\/dev\//i },
  { label: 'runs an encoded PowerShell command', pattern: /\b(?:powershell|pwsh)(?:\.exe)?\b[^\n]*(?:-enc|-encodedcommand)\b/i },
];

const RISKY_PATTERNS = [
  { label: 'recursively force-deletes files', pattern: /\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b/ },
  { label: 'resets Git history', pattern: /\bgit\s+reset\s+--hard\b/ },
  { label: 'removes untracked files', pattern: /\bgit\s+clean\s+-[a-z]*f/ },
  { label: 'force-pushes Git history', pattern: /\bgit\s+push\b[^\n]*--force(?:-with-lease)?\b/ },
  { label: 'grants world-writable permissions', pattern: /\bchmod\s+(?:-R\s+)?777\b/ },
  { label: 'destroys database data', pattern: /\b(?:DROP|TRUNCATE)\s+(?:TABLE|DATABASE)\b/i },
  { label: 'deletes Kubernetes resources', pattern: /\bkubectl\s+delete\b/ },
  { label: 'prunes Docker data', pattern: /\bdocker\s+(?:system\s+prune|volume\s+rm)\b/ },
];

const SUSPICIOUS_PATTERNS = [
  { label: 'asks Claude to ignore earlier instructions', pattern: /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?)\b/i },
  { label: 'asks Claude to disregard system instructions', pattern: /\bdisregard\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions?|prompts?)\b/i },
  { label: 'mentions exfiltrating data', pattern: /\b(?:exfiltrate|steal)\b[^\n]{0,60}\b(?:data|secrets?|credentials?|tokens?)\b/i },
  { label: 'asks Claude to hide behavior from the user', pattern: /\b(?:do not|don't|dont)\s+(?:tell|inform|warn|alert)\s+the\s+user\b/i },
  { label: 'asks Claude to hide information from the user', pattern: /\bhide\s+(?:this|the following|these)\b[^\n]{0,40}\bfrom\s+the\s+user\b/i },
  { label: 'asks Claude to bypass permissions', pattern: /\bbypass\s+(?:the\s+)?(?:permission|permissions|approval|safety|guardrails?)\b/i },
  { label: 'sends sensitive data to an external destination', pattern: /\bsend\s+(?:the\s+)?(?:contents?|credentials?|tokens?|secrets?)\s+to\b/i },
];

/**
 * Split an allowed-tools value without breaking `Bash(git status:*)`.
 * @param {unknown} value
 * @returns {string[]}
 */
export function splitToolList(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .flatMap((item) => splitToolList(item));
  }
  if (typeof value !== 'string') return [];

  const tokens = [];
  let current = '';
  let depth = 0;
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if ((character === ',' || /\s/.test(character)) && depth === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

/**
 * @param {string} line
 * @returns {string|null}
 */
function possibleSecretValue(line) {
  const match = POSSIBLE_SECRET_PATTERN.exec(line);
  if (!match) return null;
  const value = match[1] ?? match[2] ?? '';
  if (PLACEHOLDER_PATTERN.test(value)) return null;
  if (ENV_REFERENCE_PATTERN.test(value)) return null;
  if (/[<>]/.test(value)) return null;
  return match[0].split(/[:=]/)[0].trim().replace(/["']/g, '');
}

/** @type {import('../types.js').Rule[]} */
export const securityRules = [
  {
    id: 'secret-in-skill',
    title: 'Hardcoded credential',
    defaultSeverity: 'error',
    description: 'Detects provider-specific API keys and private keys in a skill.',
    check({ skill }) {
      const findings = [];
      for (let index = 0; index < skill.lines.length; index += 1) {
        const line = skill.lines[index];
        const matched = SECRET_PATTERNS.find((entry) => entry.pattern.test(line));
        if (!matched) continue;
        findings.push({
          message: `Possible ${matched.name} committed in a skill file.`,
          hint: 'Revoke and rotate the credential, then read it from an environment variable at runtime.',
          line: index + 1,
        });
      }
      return findings;
    },
  },
  {
    id: 'possible-secret',
    title: 'Possible hardcoded secret',
    defaultSeverity: 'warning',
    description: 'Detects generic secret assignments that are not provider-specific.',
    check({ skill }) {
      const findings = [];
      for (let index = 0; index < skill.lines.length; index += 1) {
        const line = skill.lines[index];
        if (SECRET_PATTERNS.some((entry) => entry.pattern.test(line))) continue;
        const field = possibleSecretValue(line);
        if (!field) continue;
        findings.push({
          message: `Possible hardcoded secret assigned to "${field}".`,
          hint: 'Load secrets from the environment instead of committing them to the skill.',
          line: index + 1,
        });
      }
      return findings;
    },
  },
  {
    id: 'dangerous-command',
    title: 'Dangerous shell command',
    defaultSeverity: 'error',
    description: 'Blocks commands that execute remote content or destroy a system.',
    check({ skill }) {
      const findings = [];
      for (let index = 0; index < skill.lines.length; index += 1) {
        const matched = DANGEROUS_PATTERNS.find((entry) => entry.pattern.test(skill.lines[index]));
        if (!matched) continue;
        findings.push({
          message: `Dangerous command ${matched.label}.`,
          hint: 'Remove the command or document a reviewed, scoped alternative.',
          line: index + 1,
        });
      }
      return findings;
    },
  },
  {
    id: 'risky-command',
    title: 'Risky shell command',
    defaultSeverity: 'warning',
    description: 'Warns about destructive commands that are sometimes legitimate.',
    check({ skill }) {
      const findings = [];
      for (let index = 0; index < skill.lines.length; index += 1) {
        const line = skill.lines[index];
        if (DANGEROUS_PATTERNS.some((entry) => entry.pattern.test(line))) continue;
        const matched = RISKY_PATTERNS.find((entry) => entry.pattern.test(line));
        if (!matched) continue;
        findings.push({
          message: `Risky command ${matched.label}.`,
          hint: 'Add a backup or confirmation step, and scope the command to a safe path.',
          line: index + 1,
        });
      }
      return findings;
    },
  },
  {
    id: 'suspicious-instruction',
    title: 'Suspicious instruction',
    defaultSeverity: 'warning',
    description: 'Flags prompt-injection and stealth phrasing in the skill body.',
    check({ skill }) {
      const lines = maskFencedCodeLines(skill.body);
      const findings = [];
      for (let index = 0; index < lines.length; index += 1) {
        const matched = SUSPICIOUS_PATTERNS.find((entry) => entry.pattern.test(lines[index]));
        if (!matched) continue;
        findings.push({
          message: `Suspicious instruction ${matched.label}.`,
          hint: 'Reword the instruction so it does not resemble a prompt injection or hidden behavior.',
          line: skill.bodyStartLine + index,
        });
      }
      return findings;
    },
  },
  {
    id: 'unscoped-bash',
    title: 'Unscoped Bash grant',
    defaultSeverity: 'warning',
    description: 'Warns when allowed-tools pre-approves every Bash command.',
    check({ skill }) {
      if (skill.frontmatterError) return [];
      const tokens = splitToolList(skill.data['allowed-tools']);
      const unscoped = tokens.some((token) => /^Bash(?:\(\s*(?:\*|\*\*|\*:\*)\s*\))?$/.test(token));
      if (!unscoped) return [];
      return [{
        message: '"allowed-tools" grants bare Bash, which pre-approves every shell command.',
        hint: 'Scope the grant, for example Bash(npm test:*).',
        line: lineOfField(skill, 'allowed-tools'),
      }];
    },
  },
];
