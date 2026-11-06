# Changelog

All notable changes to SkillProof are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-06

### Added

- Zero-config discovery of `SKILL.md` files, including `.claude/skills`, with
  symlink deduplication and configurable excludes.
- BOM- and CRLF-aware YAML frontmatter parser with duplicate-key detection and
  original-file line mapping.
- 30 lint rules across metadata, content, references, and security.
- Scoring model: 15 points per error, 5 per warning, 0 per info, with A-F grades.
- CLI with pretty, JSON, and GitHub Actions reporters.
- Thresholds for strict mode, minimum score, and maximum warnings.
- `.skillproofrc.json` configuration with exclude globs and per-rule severity
  overrides, plus a JSON Schema for editor completion.
- Composite GitHub Action with inline pull request annotations.
- Programmatic ESM API for parsing, discovery, linting, config, and scoring.
- Companion Claude Code skill that runs SkillProof and interprets findings.
- Examples: a release-notes skill with references and a script, and a minimal
  pull request description skill.
- 144 tests using `node:test`, CI on Node.js 20, 22, and 24, Dependabot, issue
  templates, and release automation.

[Unreleased]: https://github.com/Neonstudio28/skillproof/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Neonstudio28/skillproof/releases/tag/v0.1.0
