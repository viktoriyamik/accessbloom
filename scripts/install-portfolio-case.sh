#!/usr/bin/env bash
# Adds standalone AccessBloom case page to existing Vite portfolio's public assets, with backups.
set -euo pipefail
VIKI_SOURCE="${1:-/home/lihvool/viki}"
SCRIPT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ ! -f "$VIKI_SOURCE/package.json" || ! -d "$VIKI_SOURCE/public" ]]; then echo "Vite portfolio not found at $VIKI_SOURCE"; exit 1; fi
DEST="$VIKI_SOURCE/public/case-studies/accessbloom"
mkdir -p "$DEST"
if [[ -f "$DEST/index.html" ]]; then cp -a "$DEST" "${DEST}.backup.$(date +%Y%m%d%H%M%S)"; fi
cp -a "$SCRIPT_ROOT/portfolio-integration/portfolio-case/". "$DEST/"
echo "Case-study public files copied to: $DEST"
cd "$VIKI_SOURCE"
npm run build
if [[ -f "$VIKI_SOURCE/dist/case-studies/accessbloom/index.html" ]]; then echo 'Case page build confirmed at /case-studies/accessbloom/'; else echo 'Build finished but case route output not found.'; exit 1; fi
echo 'IMPORTANT: Add the featured project card from portfolio-integration/featured-card.jsx to your existing React projects array/grid.'
