# Contributing to SkillProof

Thanks for helping make Agent Skills more reliable. This project favors small, predictable behavior, useful messages, and tests for every rule.

## Setup

```bash
git clone https://github.com/Neonstudio28/skillproof.git
cd skillproof
npm ci
npm test
npm run lint:skills
```

Requirements: Node.js 20 or newer and Git. There is no build step and there are no dev dependencies.

## Before opening a pull request

Run all three:

```bash
npm test
npm run lint:skills
node --test --experimental-test-coverage
```

The full suite must pass, the repository's own skills must pass `--strict`, and new code should be covered by tests. CI runs the suite on Node.js 20, 22, and 24.

## Project layout

```text
bin/skillproof.mjs      executable entry point
src/cli.js              argument parsing, config merge, thresholds, exit codes
src/discover.js         SKILL.md discovery and exclude globs
src/frontmatter.js      BOM/CRLF-aware YAML frontmatter parser
src/lint.js             rule runner, severity overrides, scoring, sorting
src/rules/              rule modules by category
src/reporters/          pretty, JSON, and GitHub Actions output
src/index.js            public programmatic API
test/                   node:test suites and helpers
docs/SPEC.md            internal contracts
docs/rules.md           user-facing rule reference
```

Read [docs/SPEC.md](docs/SPEC.md) before changing a subsystem. It is the contract between the parser, rules, engine, CLI, and reporters.

## Adding a rule

A rule lives in one of the four modules under `src/rules/` and has this shape:

```js
{
  id: 'kebab-case-id',
  title: 'Short title',
  defaultSeverity: 'warning',
  description: 'One sentence used by --list-rules and docs.',
  check({ skill }) {
    if (skill.frontmatterError) return [];
    return {
      message: 'What is wrong.',
      hint: 'What to do instead.',
      line: 4,
    };
  },
}
```

Checklist:

- [ ] The ID is stable, unique, and kebab-case.
- [ ] The default severity is justified. Prefer `info` for subjective checks.
- [ ] `check` is synchronous and never throws on malformed input.
- [ ] Frontmatter-dependent rules return `[]` when `skill.frontmatterError` is set.
- [ ] The message does not repeat the rule ID or severity, and does not echo a secret value.
- [ ] The hint is imperative and concrete.
- [ ] A positive test proves the rule fires with the expected line.
- [ ] A negative test proves a good skill produces no finding.
- [ ] `docs/rules.md` and the README category table are updated if the count changes.
- [ ] `node bin/skillproof.mjs --list-rules` still shows the correct total.

Use `lineOfField`, `lineInBody`, and `lineMatching` from `src/utils.js` for line numbers. Mask fenced code blocks with `maskFencedCodeLines` before scanning prose for links or prompt-like text.

## Code style

- ESM JavaScript only. No TypeScript and no build step.
- Two-space indentation, single quotes, semicolons, trailing commas in multiline literals.
- Keep new dependencies out unless they remove more complexity than they add. The runtime dependency budget is one package (`yaml`).
- Export JSDoc types for public functions. The project intentionally avoids a TypeScript toolchain.
- Prefer small pure helpers and table-driven patterns over long conditionals.
- Never add network access, telemetry, or writes outside stdout/stderr.

## Tests

Use `node:test` and `node:assert/strict`. Put shared fixtures in `test/helpers.js`. Rule tests should construct a `Skill` with `makeSkill` rather than reading the parser, so a parser regression does not hide a rule regression. CLI tests should call `runCli` in-process.

Run a single file while iterating:

```bash
node --test test/rules-security.test.js
```

## Commit messages

Use a short conventional prefix when it helps: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`. Keep the subject under 72 characters and explain the why in the body for behavior changes.

## Pull requests

Keep pull requests focused. Include:

- What changed and why.
- The user-visible effect, including new rule IDs or CLI flags.
- The commands you ran.
- Before/after output for reporter or scoring changes.
- A note for any intentional rule override in the repository's own `.skillproofrc.json`.

By contributing, you agree that your contributions are licensed under the MIT License.
