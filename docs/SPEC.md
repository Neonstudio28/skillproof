# SkillProof internal specification

SkillProof is a zero-config linter for Claude Code / Agent Skills. It discovers
`SKILL.md` files, validates their YAML frontmatter and Markdown body, checks
local references, looks for risky instructions, and returns a score suitable for
CI.

This document is the contract between subsystems. If an implementation detail is
not specified here, prefer the smaller, more predictable behavior.

## Non-negotiable constraints

- Node.js 20+ and ESM JavaScript. No TypeScript, no build step.
- One runtime dependency: `yaml`. Everything else is a Node built-in.
- Lint rules are synchronous and must never throw on malformed input.
- Never read outside the skill directory except for files explicitly linked from
  `SKILL.md` (and even then, only for `.md` content checks).
- No network access.
- Report useful line numbers. Findings without a line are acceptable but rare.
- A valid, well-written skill must produce zero errors and zero warnings. Avoid
  noisy heuristics; prefer info severity when a rule is subjective.
- Every rule needs at least one positive test (it fires) and one negative test
  (it does not fire on a good skill).

## Data contracts

See `src/types.js` for the authoritative shapes. Summary:

- `Skill` is produced by `parseSkill(raw, filePath)`.
- `Rule.check({ skill })` returns `RuleFinding | RuleFinding[] | null`.
- The lint engine adds `ruleId`, `severity`, and `file`.
- `SkillResult` is what reporters receive.
- `Report` is assembled by the CLI and passed to a reporter.

## Scoring

Start at 100. Subtract 15 per error, 5 per warning, 0 per info. Clamp to 0-100.
Grades: A >= 90, B >= 80, C >= 70, D >= 60, F otherwise. The overall score is
the unweighted mean of skill scores, rounded to the nearest integer.

Configuration can change severity (`off`, `info`, `warning`, `error`), which
changes the score. The four frontmatter parse failures are engine-level errors
and cannot be disabled.

## Parser contract

`src/frontmatter.js` exports:

```js
parseSkill(raw, filePath) -> Skill
parseFrontmatter(raw) -> { data, raw, startLine, endLine, body, bodyStartLine, error }
```

Rules:

1. The opening delimiter is recognized only when it is the literal first line
   (`---`, optional trailing `\r`). A BOM before it is an error with code `bom`.
2. The closing delimiter is the next line that is exactly `---`. Missing closing
   delimiter is `invalid`.
3. Frontmatter is parsed with the `yaml` package. YAML errors become
   `frontmatterError` with code `invalid` and a 1-based line in the original
   file. Duplicate keys are errors.
4. A scalar or array document is code `not-object`; `data` becomes `{}`.
5. `body` starts immediately after the closing delimiter. `bodyStartLine` is
   1-based. Missing frontmatter means `body === raw`, `bodyStartLine === 1`.
6. `frontmatterRaw` excludes the delimiters. `frontmatterStartLine` is 2 for a
   normal file; `frontmatterEndLine` is the closing delimiter line.
7. Preserve CRLF line numbering (split on `\n`; a retained `\r` is fine for
   matching key lines).
8. Never throw. Every malformed input must return a `Skill` with a useful
   `frontmatterError`.
9. `name` is `data.name.trim()` when it is a non-empty string, otherwise
   `dirName`.

Suggested error messages:

- missing: `SKILL.md must start with YAML frontmatter (--- on the first line).`
- bom: `SKILL.md starts with a UTF-8 BOM, so --- is not the first line.`
- invalid: `Invalid YAML frontmatter: <first line of YAML error>.`
- not-object: `Frontmatter must be a YAML mapping, not a <type>.`

## Rule contract

Rules live in four modules and are concatenated by `src/rules/index.js`:

- `metadata.js` -> `metadataRules` (frontmatter field and naming rules)
- `content.js` -> `contentRules` (body quality rules)
- `references.js` -> `referenceRules` (local files and progressive disclosure)
- `security.js` -> `securityRules` (credentials, dangerous commands, prompts)

Every rule has this shape:

```js
{
  id: 'kebab-case-id',
  title: 'Short title',
  defaultSeverity: 'error' | 'warning' | 'info',
  description: 'One sentence for --list-rules and docs.',
  check({ skill }) { return null; }
}
```

Rules that depend on frontmatter must start with:

```js
if (skill.frontmatterError) return [];
```

Use `lineOfField` and `lineInBody` from `src/utils.js` for line numbers. Do not
include the rule ID or severity in `message`; the engine does that. Hints should
be imperative and concrete.

## Metadata rules (`src/rules/metadata.js`)

Documented frontmatter fields (anything else is unknown):

`name`, `description`, `when_to_use`, `argument-hint`, `arguments`,
`disable-model-invocation`, `user-invocable`, `allowed-tools`,
`disallowed-tools`, `model`, `effort`, `context`, `agent`, `background`,
`hooks`, `paths`, `shell`, `metadata`, `license`, `compatibility`.

| ID | Severity | Behavior |
| --- | --- | --- |
| `frontmatter-unknown-field` | warning | One finding per unknown key. Claude Code silently ignores typos, so call it out. |
| `field-type` | error | Validate types for every known field. String fields: name, description, when_to_use, argument-hint, model, agent, license, compatibility. Boolean fields: disable-model-invocation, user-invocable, background (accept boolean or yes/no/on/off/1/0, case-insensitive). String-or-string-array: allowed-tools, disallowed-tools, arguments, paths. Object fields: hooks, metadata. `context` must be `fork`; `effort` must be one of low, medium, high, xhigh, max; `compatibility` max 500 characters. Report one finding per bad field, at that field's line. |
| `fork-fields` | warning | `agent` or `background` without `context: fork` has no effect. |
| `name-required` | error | `name` must be a non-empty string. Mention that Claude Code can infer the folder name, but portable Agent Skills require the field. |
| `name-format` | error | Max 64 characters; `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`. Message should distinguish length, illegal characters, and leading/trailing/consecutive hyphens. |
| `name-reserved` | warning | Names containing the words `anthropic` or `claude` violate the portable spec. Claude Code itself accepts them. |
| `name-directory` | warning | `name` should match the parent directory for predictable `/name` invocation. |
| `description-required` | error | Non-empty string. |
| `description-length` | error | Description alone max 1,024 characters. |
| `description-truncation` | warning | `description` + `when_to_use` over 1,536 characters is truncated in Claude Code's skill listing. |
| `description-trigger` | warning | Must say when to use it. Accept phrases such as "Use when", "Use this skill", "when the user", "when working with", "whenever", "trigger". |
| `description-third-person` | warning | Reject first/second person pronouns (`I`, `me`, `my`, `we`, `us`, `our`, `you`, `your`). Official guidance requires third person. |
| `description-xml` | warning | Angle-bracket XML/HTML tags are prohibited by the portable spec; recommend backticks. |
| `reserved-directory` | error | Directory names `synced` and `anthropic-skills` are reserved by Claude Code (case-insensitive). |

Do not emit duplicate findings for the same field: e.g. a missing description
should not also produce `description-length`. Tests must cover both the positive
and the guard cases.

## Content rules (`src/rules/content.js`)

All rules guard `skill.frontmatterError` and return `[]`.

| ID | Severity | Behavior |
| --- | --- | --- |
| `body-empty` | warning | Body has no non-whitespace content. |
| `body-heading` | info | Body has no Markdown heading (`#` through `######`). |
| `body-length` | warning | Body exceeds 500 lines. Report actual count and recommend progressive disclosure. |
| `body-token-budget` | warning | Estimated body tokens > 5,000 (`Math.ceil(chars / 4)`). |
| `windows-path` | warning | Detect Windows-style file paths with known extensions, e.g. `scripts\helper.py`, `reference\guide.md`. Use forward slashes instead. Report the first occurrence. |
| `unfinished-content` | info | Body contains TODO, TBD, FIXME, or XXX. Report the first occurrence. |

## Reference rules (`src/rules/references.js`)

Mask fenced code blocks before scanning for links or prompt-like text. Process
Markdown links line by line so findings point at the right line. Skip external
URLs, anchors, mail links, data URLs, absolute paths, and targets containing
template syntax (`${`, `{{`, `<`, `>`) or glob characters.

| ID | Severity | Behavior |
| --- | --- | --- |
| `broken-reference` | warning | A same-line Markdown link/image points at a local relative path that does not exist. Strip `#fragment` and `?query` before checking. |
| `nested-reference` | warning | A linked `.md` file itself links to another local `.md` file (other than `SKILL.md`). Progressive disclosure should stay one level deep. One finding per reference file is enough. |
| `reference-toc` | info | A linked `.md` file over 100 lines has no "Contents" / "Table of contents" heading in its first 40 lines. |
| `orphan-resource` | info | A file in the skill directory (max depth 5) is never mentioned by relative path or basename in `SKILL.md`. Skip `SKILL.md`, dotfiles, README/LICENSE/CHANGELOG, and known non-resource directories. Cap at 10 findings. Put the orphan path in `file` and line 1. |

## Security rules (`src/rules/security.js`)

Never echo a suspected secret value in a message. Scan the raw file for secrets
and commands (frontmatter can contain them too), and the body only for
prompt-like instructions. Mask fenced code blocks for `suspicious-instruction`.

| ID | Severity | Behavior |
| --- | --- | --- |
| `secret-in-skill` | error | Provider-specific credential patterns: Anthropic `sk-ant-`, OpenAI `sk-proj-`, GitHub `ghp_`/`github_pat_`, AWS `AKIA`, Slack `xox*-`, Google `AIza`, GitLab `glpat-`, npm `npm_`, private-key headers. Message names the provider, never the value. |
| `possible-secret` | warning | Generic `api_key = "..."`, `token: "..."`, `password = "..."` assignments of 16+ characters. Ignore placeholders (`your`, `example`, `placeholder`, `xxx`, `redacted`, `changeme`, `dummy`, `test`, `fake`) and environment references. |
| `dangerous-command` | error | Pipe-to-shell (`curl`/`wget` into sh/bash/zsh), `eval "$(curl ...)"`, base64 decode into a shell, `rm -rf /` or `~`, fork bomb, raw writes to block devices (`dd of=/dev/sd*`, `mkfs ... /dev/*`), encoded PowerShell. One finding per line. |
| `risky-command` | warning | Recursive force delete, `git reset --hard`, `git clean -f`, force push, `chmod 777`, `DROP/TRUNCATE TABLE`, `kubectl delete`, `docker system prune`, `docker volume rm`. Skip lines already reported by `dangerous-command`. |
| `suspicious-instruction` | warning | Prompt-injection or stealth phrasing: "ignore previous instructions", "disregard prior instructions", exfiltrate/steal data, "don't tell the user", "hide this from the user", "bypass permissions", "send credentials to". |
| `unscoped-bash` | warning | `allowed-tools` grants bare `Bash` or `Bash(*)` (all commands) instead of a scoped rule such as `Bash(npm test:*)`. Parse YAML lists and comma/space-separated strings without breaking tool specs that contain spaces. |

## CLI contract (wave 2)

`bin/skillproof.mjs` calls `run(process.argv.slice(2))` and sets
`process.exitCode`. `src/cli.js` exports `run(argv, io?)` and must be testable
without spawning a process.

Flags:

- `--format pretty|json|github` (default pretty)
- `--json` alias for `--format json`; conflict with a non-json `--format` is an error
- `--strict` (warnings fail), `--no-strict`
- `--min-score <0-100>`, `--max-warnings <n>`
- `--exclude <glob>` repeatable
- `--config <path>`
- `--allow-empty`
- `--no-color`
- `--list-rules`
- `--help`, `--version`
- `--` ends option parsing
- Positional paths default to `.`

Behavior:

- Load `.skillproofrc.json` from cwd unless `--config` is given. CLI values
  override config; `--exclude` appends to config exclusions.
- Discover `SKILL.md` files, lint them, and build a `Report`.
- Exit 0 when clean; 1 when lint findings violate the thresholds; 2 for usage,
  discovery, config, or read errors.
- `--strict` fails on warnings; infos never fail. `--max-warnings` is an
  additional cap. `--min-score` compares the overall score.
- No skills found: exit 2 with an actionable message, unless `--allow-empty`.
- JSON goes to stdout only. Errors go to stderr. GitHub format writes workflow
  commands to stdout.
- `--list-rules` prints ID, severity, and title, sorted by ID.
- `--version` prints `skillproof <package version>`.
- Colors only when stdout is a TTY, `NO_COLOR` is unset, and `--no-color` is not
  passed. `FORCE_COLOR=1` enables them in tests.
- `failureReasons` is a string array used by reporters and the JSON output.

### Reporters

- `src/reporters/pretty.js`: human output. Show per-skill path, name, score and
  grade; findings grouped by skill with severity, rule ID, message, line, and
  indented hint; final counts and overall score. Clean skills get a check mark.
- `src/reporters/json.js`: stable, documented shape:
  ```json
  {
    "tool": "skillproof",
    "version": "0.1.0",
    "ok": false,
    "summary": {"skills": 1, "errors": 1, "warnings": 2, "info": 0, "score": 85, "grade": "B"},
    "failureReasons": ["1 error(s)"],
    "skills": [
      {
        "path": "skills/foo/SKILL.md",
        "name": "foo",
        "score": 85,
        "grade": "B",
        "summary": {"errors": 1, "warnings": 2, "info": 0},
        "findings": [
          {"ruleId": "name-format", "severity": "error", "message": "...", "hint": "...", "line": 2, "file": "skills/foo/SKILL.md"}
        ]
      }
    ]
  }
  ```
  Paths are relative to the invocation directory with POSIX separators. Omit
  undefined fields. End with a newline.
- `src/reporters/github.js`: GitHub Actions workflow commands. Escape data
  (`%`, CR, LF) and properties (`%`, CR, LF, `:`, `,`). Map error/warning/info to
  `::error`/`::warning`/`::notice`. Include `file`, `line`, and
  `title=skillproof/<rule-id>`. Emit a final summary command; use `::error` when
  the report failed.

## Discovery contract

`discoverSkillFiles(paths, { cwd, exclude })`:

- Explicit files must be named `SKILL.md`; otherwise throw `DiscoveryError`.
- Directories recurse up to depth 25, follow symlinks, and deduplicate by real
  path to avoid cycles.
- Skip `node_modules`, `.git`, `.hg`, `.svn`, `.next`, `.nuxt`, `.venv`, `venv`,
  `__pycache__`, `build`, `dist`, `coverage`, `vendor`, `.cache`.
- Do not skip all dotfiles; `.claude/skills` must be discovered.
- Exclusions support `*`, `**`, and `?`; a pattern without `/` matches at any
  depth; a trailing `/` matches a directory and its contents.

## Testing

Use `node:test` and `node:assert/strict`. Use `test/helpers.js` for unit rule
objects, temp directories, and CLI spawning. Rule tests must not depend on the
parser. Run only your own test files while other subsystems are in flight:

```bash
node --test test/frontmatter.test.js
node --test test/rules-metadata.test.js
node --test test/rules-content.test.js test/rules-references.test.js
node --test test/rules-security.test.js
node --test test/cli.test.js test/reporters.test.js
```

Also run `node --check` on every file you create. Do not modify `package.json`,
`package-lock.json`, or another agent's files.
