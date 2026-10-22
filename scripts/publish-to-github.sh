#!/usr/bin/env bash
# Publish AccessBloom source to the existing GitHub repository (legacy repo slug).
set -euo pipefail
cd "$(dirname "$0")/.."
command -v gh >/dev/null || { echo 'Install GitHub CLI (gh) first.'; exit 1; }
command -v git >/dev/null || { echo 'git missing'; exit 1; }
gh auth status >/dev/null || { echo 'Run gh auth login first (with repo permissions).'; exit 1; }
if [[ -f .env || -d data ]]; then echo 'Secrets/data files exist: verify .gitignore before publishing.'; fi
if [[ ! -d .git ]]; then git init -b main; fi
if [[ -z $(git config user.name || :) || -z $(git config user.email || :) ]]; then echo 'Configure git user.name and user.email first.'; exit 1; fi
git add .
if ! git diff --cached --quiet; then git commit -m 'Build AccessBloom accessibility studio and portfolio case'; fi
for OWNER in oleglihvoinen; do
  REPO="$OWNER/accesslens-ai"
  if gh repo view "$REPO" >/dev/null 2>&1; then echo "Using existing $REPO"; else gh repo create "$REPO" --public --description 'AccessBloom — evidence-based accessibility auditing with explainable AI and human review'; fi
  REMOTE="github-$OWNER"
  git remote remove "$REMOTE" >/dev/null 2>&1 || true
  git remote add "$REMOTE" "https://github.com/$REPO.git"
  # Never force-push an existing repository.
  git push "$REMOTE" HEAD:refs/heads/main
  echo "Pushed $REPO"
done
