---
name: release-notes
description: Builds release notes from merged pull requests and git history. Use when the user asks for release notes, a changelog, or a summary of changes between versions.
allowed-tools:
  - Read
  - Grep
  - Glob
  - "Bash(git log:*)"
  - "Bash(git tag:*)"
---

# Release Notes

Turn repository history into release notes that a user can scan in under a minute.
Keep the output about user-visible changes, not the internal implementation.

## Workflow

1. Read [reference/format.md](reference/format.md) for the required output shape.
2. Run [scripts/collect-changes.sh](scripts/collect-changes.sh) to list candidate commits.
   Pass the previous release tag as the first argument when one is known.
3. Open the referenced pull requests and remove commits that are not user-visible
   (dependency bumps, formatting-only changes, test-only changes).
4. Group the remaining changes into Features, Fixes, Performance, and Maintenance.
5. Write one line per change. Start with a verb, name the affected surface, and
   link the pull request number.
6. Put breaking changes first and include the migration step.

## Quality bar

- Every line answers "what can the user do differently after this release?"
- Do not paste commit messages verbatim when they are ambiguous.
- Do not include internal ticket IDs unless the repository already exposes them.
- If there are no notable changes, say so in one sentence instead of padding.
