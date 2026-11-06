---
name: pr-description
description: Drafts clear pull request descriptions from a diff and repository context. Use when the user asks to write or improve a pull request description.
allowed-tools:
  - Read
  - Grep
  - Glob
  - "Bash(git diff:*)"
  - "Bash(git status:*)"
---

# Pull Request Description

Write a pull request description that lets a reviewer understand the change
without reconstructing it from the diff.

## Workflow

1. Run `git status --short` and `git diff --stat` to learn the scope.
2. Read the changed files that carry behavior, not only the largest ones.
3. Identify the user-visible effect, the reason for the change, and the risk.
4. Write the description with these sections:

```md
## Summary

One paragraph explaining what changed and why.

## Changes

- Bullet the concrete edits a reviewer should verify.

## Testing

- List the commands run and the scenarios covered.

## Risk

- Call out migrations, feature flags, or follow-up work. Remove this section
  when there is no meaningful risk.
```

## Rules

- Describe behavior, not file names.
- Mention the trade-off that was rejected when the choice is not obvious.
- Never claim a test passed unless its command is listed.
- Keep the summary under 120 words.
- Do not add screenshots for text-only changes.
