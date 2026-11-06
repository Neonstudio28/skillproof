# Rules

SkillProof runs 30 rules across four categories. This page lists every rule, its default severity, and the behavior it enforces. Run `skillproof --list-rules` for the same data in the terminal.

## Severity and scoring

| Severity | Score cost | Fails the default run? | Fails `--strict`? |
| --- | ---: | :---: | :---: |
| `error` | 15 points | Yes | Yes |
| `warning` | 5 points | No | Yes |
| `info` | 0 points | No | No |

Severity can be changed per rule in `.skillproofrc.json`:

```json
{
  "rules": {
    "body-heading": "off",
    "name-directory": "error",
    "orphan-resource": "warning"
  }
}
```

Valid values are `off`, `info`, `warning`, and `error`. Unknown rule IDs and invalid severities are configuration errors.

## Parser errors

These findings are produced by the frontmatter parser, not by configurable rules. They are always errors and cannot be disabled.

| ID | When it appears |
| --- | --- |
| `frontmatter-missing` | `SKILL.md` does not start with a literal `---` line |
| `frontmatter-bom` | The file begins with a UTF-8 BOM, so `---` is not the first line |
| `frontmatter-not-mapping` | The YAML document is a scalar or array instead of a mapping |
| `frontmatter-yaml` | The YAML is invalid, including duplicate keys or a missing closing delimiter |

Every other rule is skipped when the frontmatter cannot be parsed, which avoids cascading noise from a single syntax error.

## Metadata rules

| ID | Severity | What it checks |
| --- | --- | --- |
| `frontmatter-unknown-field` | warning | Flags keys Claude Code does not recognize. Typos are otherwise ignored silently. |
| `field-type` | error | Validates YAML types for every documented field, plus `context`, `effort`, and `compatibility` values. |
| `fork-fields` | warning | `agent` or `background` has no effect unless `context` is `fork`. |
| `name-required` | error | `name` must be a non-empty string. Claude Code can infer the directory name, but portable Agent Skills require the field. |
| `name-format` | error | Enforces lowercase kebab-case, a 64-character maximum, and no leading, trailing, or consecutive hyphens. |
| `name-reserved` | warning | Warns when the name contains the portable-spec reserved words `anthropic` or `claude`. |
| `name-directory` | warning | The frontmatter name should match the parent directory so the `/command` name is predictable. |
| `description-required` | error | Requires a non-empty description so Claude can discover the skill. |
| `description-length` | error | The description alone must be at most 1,024 characters. |
| `description-truncation` | warning | `description` plus `when_to_use` must stay under Claude Code's 1,536-character listing cap. |
| `description-trigger` | warning | The description must say when to use the skill, for example "Use when the user asks...". |
| `description-third-person` | warning | Rejects first- and second-person pronouns. Official guidance recommends third person. |
| `description-xml` | warning | Rejects XML/HTML angle-bracket tags in the description. Use backticks for placeholders. |
| `reserved-directory` | error | Rejects the Claude Code-reserved directory names `synced` and `anthropic-skills`, case-insensitively. |

### Documented frontmatter fields

`name`, `description`, `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context`, `agent`, `background`, `hooks`, `paths`, `shell`, `metadata`, `license`, `compatibility`.

`field-type` accepts booleans written as `true`/`false`, `yes`/`no`, `on`/`off`, or `1`/`0`. String-list fields accept either one string or an array of strings. `context` may only be `fork`. `effort` may be `low`, `medium`, `high`, `xhigh`, or `max`.

## Content rules

| ID | Severity | What it checks |
| --- | --- | --- |
| `body-empty` | warning | The body has no instructions after the frontmatter. |
| `body-heading` | info | The body has no Markdown heading, which makes it harder to scan. |
| `body-length` | warning | The body exceeds 500 lines. Move detail into linked references. |
| `body-token-budget` | warning | The body is estimated above 5,000 tokens using `ceil(characters / 4)`. |
| `windows-path` | warning | Finds Windows-style backslash paths with known file extensions. Reports the first occurrence. |
| `unfinished-content` | info | Finds `TODO`, `TBD`, `FIXME`, or `XXX`. Reports the first occurrence. |

## Reference rules

Reference scanning ignores fenced code blocks, external URLs, anchors, mail links, data URLs, absolute paths, templates, and glob patterns.

| ID | Severity | What it checks |
| --- | --- | --- |
| `broken-reference` | warning | A Markdown link or image points at a local relative file that does not exist. Fragments and query strings are stripped before checking. |
| `nested-reference` | warning | A linked Markdown file links to another local Markdown file, other than `SKILL.md`. Progressive disclosure should stay one level deep. |
| `reference-toc` | info | A linked Markdown file over 100 lines has no "Contents" or "Table of contents" heading in its first 40 lines. |
| `orphan-resource` | info | A file inside the skill directory (depth 5) is never mentioned by relative path or basename in `SKILL.md`. Skips `SKILL.md`, dotfiles, README/LICENSE/CHANGELOG, `node_modules`, and files without a known resource extension. Caps at 10 findings. |

`orphan-resource` findings point at the orphaned file rather than `SKILL.md`, so editors and CI annotations land on the resource.

## Security rules

Security rules scan the raw file for credentials and commands, including the frontmatter. Prompt-injection rules scan the body and ignore fenced code examples.

| ID | Severity | What it checks |
| --- | --- | --- |
| `secret-in-skill` | error | Provider-specific credentials: Anthropic `sk-ant-`, OpenAI `sk-proj-`, GitHub `ghp_` and `github_pat_`, AWS `AKIA`, Slack `xox*-`, Google `AIza`, GitLab `glpat-`, npm `npm_`, and private-key headers. Messages name the provider but never echo the value. |
| `possible-secret` | warning | Generic assignments such as `api_key = "..."`, `token: "..."`, or `password = "..."` with 16 or more characters. Placeholders and environment references are ignored. |
| `dangerous-command` | error | Pipe-to-shell downloads, `eval "$(curl ...)"`, base64 decode into a shell, `rm -rf /` or `~`, fork bombs, raw block-device writes, `mkfs`, and encoded PowerShell. |
| `risky-command` | warning | Recursive force delete, `git reset --hard`, `git clean -f`, force push, `chmod 777`, `DROP`/`TRUNCATE`, `kubectl delete`, and Docker prune/volume removal. Lines already reported as dangerous are skipped. |
| `suspicious-instruction` | warning | Prompt-injection and stealth phrasing such as "ignore previous instructions", "disregard prior instructions", data exfiltration, "don't tell the user", "hide this from the user", permission bypass, and "send credentials to". |
| `unscoped-bash` | warning | `allowed-tools` grants bare `Bash`, `Bash(*)`, or equivalent, which pre-approves every shell command. Prefer a scoped grant such as `Bash(npm test:*)`. |

Security rules are heuristics, not a guarantee. Pair SkillProof with code review, secret scanning, and least-privilege tool grants.

## Adding a rule

See [CONTRIBUTING.md](../CONTRIBUTING.md). Every rule needs a stable kebab-case ID, a default severity, a synchronous `check` function, a positive test, and a negative test on a good skill. Rules must return `[]` when `skill.frontmatterError` is set.
