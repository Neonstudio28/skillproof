#!/usr/bin/env bash
set -euo pipefail

# List non-merge commits since the previous release tag. The caller may pass a
# base revision explicitly; otherwise use the latest reachable tag.
base="${1:-$(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)}"

git log \
  --no-merges \
  --pretty=format:'- %s (%h)' \
  "${base}..HEAD"
