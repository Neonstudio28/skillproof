# Release Notes Format

Use this structure unless the repository has an established changelog format.

## Required sections

```md
## Version <version> - <YYYY-MM-DD>

### Breaking changes

- <change> ([#<pr>](https://github.com/<owner>/<repo>/pull/<pr>))

### Features

- <change> ([#<pr>](https://github.com/<owner>/<repo>/pull/<pr>))

### Fixes

- <change> ([#<pr>](https://github.com/<owner>/<repo>/pull/<pr>))

### Maintenance

- <change> ([#<pr>](https://github.com/<owner>/<repo>/pull/<pr>))
```

## Rules

- Omit a section when it has no entries.
- Use sentence case for every bullet.
- End every bullet without a period.
- Link the pull request, not the commit, when both exist.
- Keep each bullet under 120 characters.
- Put the most disruptive change first inside a section.

## Example

```md
## Version 2.4.0 - 2026-10-14

### Features

- Add batch imports for CSV files ([#1842](https://github.com/example/app/pull/1842))
- Show progress while a workspace is indexed ([#1851](https://github.com/example/app/pull/1851))

### Fixes

- Preserve line endings when exporting on Windows ([#1847](https://github.com/example/app/pull/1847))
```
