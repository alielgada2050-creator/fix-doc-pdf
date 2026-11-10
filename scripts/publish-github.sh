#!/usr/bin/env bash
# Publishes this project to a new GitHub repository and turns on: GitHub Pages (web app link),
# the container on ghcr.io, and an APK release. Needs: git and GitHub CLI (https://cli.github.com) → run `gh auth login` first.
# Usage: bash scripts/publish-github.sh [repo-name] [public|private]     (default: wathiq-pdf public)
set -euo pipefail
NAME="${1:-wathiq-pdf}"; VIS="${2:-public}"
cd "$(dirname "$0")/.."
command -v gh >/dev/null || { echo "Install GitHub CLI first: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || gh auth login -w -s repo,workflow,write:packages
OWNER="$(gh api user -q .login)"; LOW_OWNER="$(echo "$OWNER" | tr A-Z a-z)"; LOW_NAME="$(echo "$NAME" | tr A-Z a-z)"
sed -i.bak "s#ghcr.io/OWNER/REPO#ghcr.io/$LOW_OWNER/$LOW_NAME#" docker-compose.yml && rm -f docker-compose.yml.bak
[ -d .git ] || git init -q -b main
git add -A
git -c user.name="${GIT_NAME:-$OWNER}" -c user.email="${GIT_EMAIL:-$OWNER@users.noreply.github.com}" commit -qm "وثيق PDF: initial publish" || true
if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create "$NAME" --"$VIS" --source=. --remote=origin --description "وثيق PDF — free Arabic/English PDF & document tools (web, Android, container)" --homepage "https://$LOW_OWNER.github.io/${NAME}/"
fi
git push -u origin main
# GitHub Pages from Actions (public repos on free plans; private repos need a paid plan)
gh api -X POST "repos/$OWNER/$NAME/pages" -f build_type=workflow >/dev/null 2>&1 || gh api -X PUT "repos/$OWNER/$NAME/pages" -f build_type=workflow >/dev/null 2>&1 || true
# a version tag builds the APK release
TAG="v1.0.$(date +%Y%m%d%H%M)"; git tag "$TAG" && git push origin "$TAG"
cat <<MSG

Done. In a few minutes (watch: https://github.com/$OWNER/$NAME/actions):
  Web app:   https://$LOW_OWNER.github.io/$NAME/
  APK+HTML:  https://github.com/$OWNER/$NAME/releases/latest
  Container: docker run -p 8080:8080 ghcr.io/$LOW_OWNER/$LOW_NAME:latest
To let friends pull the container without logging in: GitHub → your profile → Packages → $NAME → Package settings → Change visibility → Public.
Next releases: git tag v1.0.1 && git push origin v1.0.1
MSG
