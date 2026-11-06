---
name: skillproof
description: Lints and scores Claude Code Agent Skills with SkillProof. Use when the user asks to validate a skill, diagnose SKILL.md warnings, or add skill checks to CI.
allowed-tools:
  - Read
  - Grep
  - Glob
  - "Bash(node bin/skillproof.mjs:*)"
---

# SkillProof

Use SkillProof to catch broken frontmatter, weak discovery descriptions, missing
references, and unsafe instructions before a skill is shared.

## Workflow

1. Confirm this repository has `bin/skillproof.mjs`. If it does, run:

   ```bash
   node bin/skillproof.mjs .claude/skills --strict
   ```

2. If the current repository does not contain SkillProof, run the published
   action source without installing it globally:

   ```bash
   npx --yes github:Neonstudio28/skillproof .claude/skills --strict
   ```

3. Read the report from the top. Fix every error first, then warnings, then
   information-level suggestions.
4. Re-run with the same command. A release-ready skill ends with exit code 0,
   zero errors, zero warnings, and a score of at least 90.

## Fixing findings

- `name-*`: keep the frontmatter name identical to the parent directory, lower
  case, and under 64 characters.
- `description-*`: state what the skill does and when to use it in third person.
  Put the trigger near the start so it survives listing truncation.
- `body-*`: add a heading, keep the workflow under 500 lines, and move reference
  material into linked files.
- `broken-reference`: make every local link resolve from the skill directory.
- `nested-reference`: link reference files directly from `SKILL.md`; do not chain
  references more than one level deep.
- `orphan-resource`: mention every bundled file by relative path or remove it.
- `secret-in-skill`, `possible-secret`: delete the value, rotate it, and read the
  secret from the environment at runtime.
- `dangerous-command`, `risky-command`: replace destructive commands with scoped
  alternatives and document the recovery path.
- `unscoped-bash`: grant a tool pattern such as `Bash(npm test:*)` instead of all
  of Bash.

## Guardrails

- Do not disable a rule in `.skillproofrc.json` just to make the report green.
- Do not weaken tests or delete references to hide a finding.
- Explain any intentional severity override in the pull request.
- Treat a skipped check as a failed check; run the command again after edits.
