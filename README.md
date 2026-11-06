<p align="center">
  <img src="assets/logo.svg" width="96" height="96" alt="SkillProof logo">
</p>

<h1 align="center">SkillProof</h1>

<p align="center"><strong>Lint, score, and ship reliable Claude Code Agent Skills.</strong></p>

<p align="center">
  <a href="https://github.com/Neonstudio28/skillproof/actions/workflows/ci.yml"><img src="https://github.com/Neonstudio28/skillproof/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&amp;logoColor=white" alt="Node.js 20+"></a>
  <a href="action.yml"><img src="https://img.shields.io/badge/GitHub%20Action-ready-2088FF?logo=githubactions&amp;logoColor=white" alt="GitHub Action"></a>
</p>

---

**SkillProof is a zero-config CLI and GitHub Action that validates `SKILL.md` files.** It checks frontmatter, discovery descriptions, progressive disclosure, bundled resources, credentials, dangerous commands, and prompt-injection patterns, then gives every skill a score from 0 to 100.

No build step. No telemetry. One runtime dependency.

```console
$ npx --yes github:Neonstudio28/skillproof .claude/skills

SkillProof 0.1.0  ·  3 skills

✔ .claude/skills/skillproof/SKILL.md  skillproof  100/100 A
✔ examples/pr-description/SKILL.md  pr-description  100/100 A
✔ examples/release-notes/SKILL.md  release-notes  100/100 A

3 skills · 0 errors · 0 warnings · 0 info
Overall score: 100/100 (A)
All checks passed.
```

## Why

A skill is part code, part prompt, and part package. A typo in `name`, a description that never says when to use the skill, a reference file that moved, or a leaked token can silently degrade behavior or create a security problem. Claude Code does not fail on most of these mistakes, so they ship unnoticed.

SkillProof turns those silent failures into actionable findings with line numbers, a score, and CI annotations.

## Quick start

```bash
# Run against one skill directory
npx --yes github:Neonstudio28/skillproof .claude/skills/my-skill

# Scan a repository for every SKILL.md
npx --yes github:Neonstudio28/skillproof .

# Fail CI on warnings and enforce a quality floor
npx --yes github:Neonstudio28/skillproof .claude/skills --strict --min-score 90
```

Typical report:

```console
$ npx --yes github:Neonstudio28/skillproof .claude/skills

SkillProof 0.1.0  ·  1 skill

✖ .claude/skills/pr-review/SKILL.md  pr-review  80/100 B
    warning  name-directory  Name "pr-review" does not match the directory "review". (line 2)
             ↳ Keep them identical so the /command name is predictable.
    error    description-required  A skill needs a non-empty "description" so Claude can discover it. (line 4)
             ↳ Say what the skill does and when to use it.

1 skill · 1 error · 1 warning · 0 info
Overall score: 80/100 (B)
Failed:
  - 1 error(s)
```

## What it checks

Thirty rules across four categories:

| Category | Rules | Examples |
| --- | ---: | --- |
| Metadata | 14 | Required fields, YAML types, name grammar, description length, trigger phrasing, reserved names |
| Content | 6 | Empty bodies, missing headings, 500-line and 5,000-token budgets, Windows paths, unfinished markers |
| References | 4 | Broken local links, nested progressive disclosure, long files without a contents section, orphaned resources |
| Security | 6 | Hardcoded credentials, destructive commands, prompt injection, unscoped `Bash` grants |

See [docs/rules.md](docs/rules.md) for every rule, its default severity, and how to fix it.

SkillProof intentionally goes beyond schema validation:

- **Portable Agent Skills.** Enforces the portable name grammar and description limits while allowing Claude Code-specific fields.
- **Progressive disclosure.** Verifies that linked reference files exist, stay one level deep, and are actually reachable from `SKILL.md`.
- **Prompt and supply-chain hygiene.** Scans the entire skill file for credentials and dangerous commands, and masks fenced code blocks when looking for injection-style instructions.
- **Actionable output.** Findings carry a rule ID, severity, message, and hint, with line numbers whenever they are available.

## Install

SkillProof is **not published on npm**. The `skillproof` registry name belongs to an unrelated package. Install from GitHub instead:

```bash
# One-off
npx --yes github:Neonstudio28/skillproof --help

# Global
npm install --global github:Neonstudio28/skillproof

# Project dev dependency
npm install --save-dev github:Neonstudio28/skillproof
npx skillproof .claude/skills
```

Requires Node.js 20 or newer and Git.

## CLI

```text
Usage: skillproof [options] [paths...]

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
```

### Exit codes

| Code | Meaning |
| ---: | --- |
| `0` | Clean, or all configured thresholds passed |
| `1` | Errors, strict-mode warnings, or a score/warning threshold failed |
| `2` | Usage, configuration, discovery, or file-read error |

`--strict` fails on warnings. Info findings never fail the build. `--max-warnings` is an additional cap, and `--min-score` compares the overall score.

### Machine-readable output

```bash
skillproof .claude/skills --format json
```

```json
{
  "tool": "skillproof",
  "version": "0.1.0",
  "ok": false,
  "summary": {
    "skills": 1,
    "errors": 1,
    "warnings": 1,
    "info": 0,
    "score": 80,
    "grade": "B"
  },
  "failureReasons": ["1 error(s)"],
  "skills": [
    {
      "path": "my-skill/SKILL.md",
      "name": "my-skill",
      "score": 80,
      "grade": "B",
      "summary": { "errors": 1, "warnings": 1, "info": 0 },
      "findings": [
        {
          "ruleId": "description-required",
          "severity": "error",
          "message": "A skill needs a non-empty \"description\" so Claude can discover it.",
          "hint": "Say what the skill does and when to use it.",
          "line": 4,
          "file": "my-skill/SKILL.md"
        }
      ]
    }
  ]
}
```

Paths are relative to the invocation directory and use POSIX separators. Undefined fields are omitted.

### Console output

Set `FORCE_COLOR=1` to enable ANSI colors in a non-TTY environment, or `NO_COLOR=1` to disable them. `--no-color` always wins.

## GitHub Actions

```yaml
name: Skills

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  skillproof:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: Neonstudio28/skillproof@v1
        with:
          paths: .claude/skills
          strict: true
          min-score: 90
```

Findings appear as inline annotations on the pull request diff. The action exits non-zero when a threshold fails.

### Action inputs

| Input | Default | Description |
| --- | --- | --- |
| `paths` | `.` | Space-separated files or directories to scan |
| `strict` | `true` | Fail when warnings are present |
| `min-score` | `0` | Minimum overall score from 0 to 100; `0` disables it |
| `max-warnings` | empty | Maximum allowed warnings; empty disables it |
| `exclude` | empty | Newline-separated glob patterns to skip |
| `format` | `github` | Reporter to use: `github`, `pretty`, or `json` |

The action sets up Node.js 20, installs SkillProof's single runtime dependency from the locked `package-lock.json`, and runs the CLI from the action checkout. It does not install SkillProof from npm.

> Pin a full commit SHA or a release tag for immutable CI. Use `@v1` only if you want automatic minor and patch updates within the major version.

## Configuration

Add `.skillproofrc.json` to the project root:

```json
{
  "$schema": "https://raw.githubusercontent.com/Neonstudio28/skillproof/main/docs/skillproof.schema.json",
  "exclude": ["**/fixtures/**", "vendor/"],
  "rules": {
    "body-heading": "off",
    "description-trigger": "error"
  },
  "strict": true,
  "minScore": 90,
  "maxWarnings": 0
}
```

Rules can be set to `off`, `info`, `warning`, or `error`. Command-line options override the config, while `--exclude` appends to it. The four frontmatter parse failures (`frontmatter-missing`, `frontmatter-bom`, `frontmatter-not-mapping`, `frontmatter-yaml`) are engine-level errors and cannot be disabled.

### Excludes

`exclude` supports a predictable glob subset:

- `*` matches within one path segment.
- `**` matches across segments.
- `?` matches one non-slash character.
- A pattern without `/` matches at any depth.
- A trailing `/` matches a directory and everything below it.

```json
{
  "exclude": ["**/fixtures/**", "archive/", "**/*.generated.md"]
}
```

## Scoring

Every skill starts at 100:

| Finding | Points deducted |
| --- | ---: |
| Error | 15 |
| Warning | 5 |
| Info | 0 |

Scores are clamped to 0-100. The overall score is the unweighted mean of all skill scores, rounded to the nearest integer.

| Grade | Score |
| --- | --- |
| A | 90-100 |
| B | 80-89 |
| C | 70-79 |
| D | 60-69 |
| F | 0-59 |

Severity overrides change the score. For example, promoting a warning to an error makes it cost 15 points instead of 5.

## Programmatic API

SkillProof is ESM and exposes its parser, discovery, lint engine, config loader, and scoring functions:

```js
import { discoverSkillFiles, lintSkillFiles } from 'skillproof';

const files = discoverSkillFiles(['.claude/skills']);
const { results, summary } = lintSkillFiles(files, { cwd: process.cwd() });

for (const result of results) {
  console.log(`${result.path}: ${result.score}/100 (${result.grade})`);
}

console.log(summary);
```

Other exports include `parseSkill`, `parseFrontmatter`, `lintSkill`, `loadConfig`, `validateConfig`, `rules`, `rulesById`, `scoreFindings`, `gradeFor`, and `summarize`.

## Companion Claude Code skill

This repository ships a skill that teaches Claude how to run SkillProof, interpret findings, and avoid hiding failures:

```bash
mkdir -p .claude/skills
cp -R /path/to/skillproof/.claude/skills/skillproof .claude/skills/
```

Then ask Claude to "validate this skill with SkillProof" or "add skill checks to CI". The companion skill lives at [.claude/skills/skillproof/SKILL.md](.claude/skills/skillproof/SKILL.md).

## Examples

- [examples/release-notes](examples/release-notes/SKILL.md) demonstrates a referenced format guide and a bundled script with reviewed `git` tool scopes.
- [examples/pr-description](examples/pr-description/SKILL.md) is a minimal, self-contained skill.

Both score 100/100 and pass `--strict`; they are checked in CI on every commit.

## Development

```bash
git clone https://github.com/Neonstudio28/skillproof.git
cd skillproof
npm ci
npm test
npm run lint:skills
```

The test suite uses the built-in `node:test` runner and covers the parser, all 30 rules, scoring, discovery, config validation, reporters, and the CLI. `npm run lint:skills` dogfoods SkillProof on this repository's companion skill and examples with `--strict`.

### Architecture

```text
bin/skillproof.mjs      executable entry point
src/cli.js              argument parsing, config merge, thresholds, exit codes
src/discover.js         SKILL.md discovery and exclude globs
src/frontmatter.js      BOM/CRLF-aware YAML frontmatter parser
src/lint.js             rule runner, severity overrides, scoring, sorting
src/rules/              metadata, content, references, security rules
src/reporters/          pretty, JSON, and GitHub Actions output
src/index.js            public programmatic API
```

Design constraints:

- Node.js 20+, ESM, no build step.
- One runtime dependency (`yaml`); everything else uses Node built-ins.
- Rules are synchronous and never throw on malformed input. A crashing rule becomes an `internal-error` finding instead of taking down the run.
- No network access, no telemetry, and no writes outside the report stream.
- A valid, well-written skill should score 100 with zero findings.

See [docs/SPEC.md](docs/SPEC.md) for the internal contracts and [CONTRIBUTING.md](CONTRIBUTING.md) for the rule-authoring checklist.

## License

MIT © 2026 Neonstudio28

SkillProof is an independent project and is not affiliated with or endorsed by Anthropic.
