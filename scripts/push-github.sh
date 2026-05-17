#!/usr/bin/env bash
# Push to ofiris-arch/smart-parcel-scanner using a Personal Access Token.
# Create token: https://github.com/settings/tokens (classic, repo scope)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  printf "Paste GitHub token for ofiris-arch (input hidden): "
  read -rs GITHUB_TOKEN
  echo
fi

if [[ -z "${GITHUB_TOKEN}" ]]; then
  echo "No token provided." >&2
  exit 1
fi

export GIT_TERMINAL_PROMPT=0
git push "https://ofiris-arch:${GITHUB_TOKEN}@github.com/ofiris-arch/smart-parcel-scanner.git" main -u

echo "Push succeeded. Enable Pages: repo Settings → Pages → GitHub Actions"
echo "App URL: https://ofiris-arch.github.io/smart-parcel-scanner/"
