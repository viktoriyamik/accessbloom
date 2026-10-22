#!/usr/bin/env bash
# One command: publish both applications, then attempt to enable verified isolated scans.
set -Eeuo pipefail
if [[ $(id -u) -ne 0 ]]; then echo 'Run with sudo'; exit 1; fi
ACCESS=/home/lihvool/accessbloom
PORTFOLIO=/home/lihvool/viki
[[ -d "$ACCESS/.git" && -d "$PORTFOLIO/.git" ]] || { echo 'Missing repository'; exit 1; }
echo '=== Updating source ==='
runuser -u lihvool -- git -C "$ACCESS" pull --ff-only origin main
runuser -u lihvool -- git -C "$PORTFOLIO" pull --ff-only origin main
echo '=== Publishing vik.ooo independently of the scanner ==='
runuser -u lihvool -- bash -c 'cd /home/lihvool/viki && npm ci --no-audit --no-fund && npm run build'
if env PM2_HOME=/root/.pm2 pm2 describe portfolio-ai >/dev/null 2>&1; then
  env PM2_HOME=/root/.pm2 pm2 restart portfolio-ai
fi
nginx -t && systemctl reload nginx
echo 'Portfolio frontend published.'
echo '=== Deploying AccessBloom API with public scans disabled first ==='
cd "$ACCESS"
npm run check
bash scripts/deploy-ubuntu.sh
envfile=/etc/accessbloom/accessbloom.env
chmod 0600 "$envfile"
sed -i '/^PUBLIC_SCANS_ENABLED=/d;/^AUDIT_BROWSER_WS=/d' "$envfile"
printf '\nPUBLIC_SCANS_ENABLED=false\n' >> "$envfile"
systemctl restart accessbloom
echo '=== Installing isolated browser/proxy and testing ==='
if bash isolation/install.sh && node scripts/check-isolation.mjs; then
  echo 'Isolation smoke test passed.'
  # Anonymous scans remain disabled pending security review and verification.
  printf '\nAUDIT_BROWSER_WS=ws://127.0.0.1:4120/\n' >> "$envfile"
  systemctl restart accessbloom
  echo 'Remote browser connected. Public scans remain disabled until egress controls are verified.'
else
  echo 'WARNING: browser isolation check failed; public scans remain disabled.'
fi
echo '=== Service health ==='
curl -fsS http://127.0.0.1:4117/accessbloom/api/health
echo
curl -fsS https://vik.ooo/accessbloom/api/config
echo
echo 'DEPLOYMENT COMPLETE: portfolio and AccessBloom UI published. Anonymous scanning not yet enabled.'
echo 'Configure OPENAI_API_KEY only in /etc/accessbloom/accessbloom.env.'
