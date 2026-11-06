# Security policy

## Supported versions

| Version | Supported |
| --- | :---: |
| 0.1.x | Yes |
| Older | No |

SkillProof is pre-1.0. Security fixes land on the latest release line.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Use GitHub's private vulnerability reporting:

<https://github.com/Neonstudio28/skillproof/security/advisories/new>

Include:

- The affected version or commit.
- A minimal `SKILL.md` or configuration that reproduces the issue.
- The impact you observed or expect.
- Any suggested fix or mitigation.

You can expect an acknowledgement within three business days and a status update within seven. Once a fix is ready, the advisory will be published with credit unless you prefer to remain anonymous.

## Scope

SkillProof runs locally, makes no network requests, and does not execute skill instructions. Relevant issues include:

- A crash, hang, or unbounded resource use caused by a crafted `SKILL.md`, config file, directory tree, or symlink layout.
- A path traversal that reads files outside the intended skill directory.
- A false negative in a security rule that is severe and practical to fix.
- Output injection into GitHub Actions workflow commands or terminal escape sequences.
- A supply-chain issue in the published package or action.

The security rules are heuristics. A missed credential pattern or dangerous command is a bug, but no scanner can guarantee detection. Do not rely on SkillProof as the only control for secrets or destructive commands.

## Safe usage

- Pin the GitHub Action to a release tag or full commit SHA.
- Run SkillProof on untrusted repositories in the same sandbox you would use for any other code.
- Review skill files before granting them tool permissions.
- Rotate any credential that was ever committed, even if SkillProof reported it.
