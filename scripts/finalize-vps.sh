#!/usr/bin/env bash
# One-shot deployment and security verification. Run as root from repo checkout.
set -Eeuo pipefail
trap 'echo "DEPLOYMENT STOPPED at line $LINENO. Existing public scan setting was not enabled."; exit 1' ERR
if [[ $(id -u) -ne 0 ]]; then echo 'Use sudo bash scripts/finalize-vps.sh';exit 1;fi
ACCESS=/home/lihvool/accessbloom
PORTFOLIO=/home/lihvool/viki
[[ -d $ACCESS/.git && -d $PORTFOLIO/.git ]] || { echo 'Missing checkout';exit 1; }
echo '=== 1/7 Updating repositories ==='
runuser -u lihvool -- git -C "$ACCESS" pull --ff-only origin main
runuser -u lihvool -- git -C "$PORTFOLIO" pull --ff-only origin main
echo '=== 2/7 Checking scanner code ==='
(cd "$ACCESS" && npm run check)
echo '=== 3/7 Installing restricted browser and proxy ==='
bash "$ACCESS/isolation/install.sh"
echo '=== 4/7 Checking browser connectivity, browser proxy and blocked private address ==='
docker inspect accessbloom-browser-worker --format '{{json .NetworkSettings.Ports}}'
(cd "$ACCESS" && node "$ACCESS/scripts/check-isolation.mjs")
echo '=== 5/7 Deploying AccessBloom API ==='
bash "$ACCESS/scripts/deploy-ubuntu.sh"
[[ -f /etc/accessbloom/accessbloom.env ]] || exit 1
sed -i '/^AUDIT_BROWSER_WS=/d' /etc/accessbloom/accessbloom.env
printf '\nAUDIT_BROWSER_WS=ws://127.0.0.1:4120/\n' >> /etc/accessbloom/accessbloom.env
# Keep anonymous mode disabled unless the complete checks above succeeded.
if grep -q '^PUBLIC_SCANS_ENABLED=' /etc/accessbloom/accessbloom.env; then
 sed -i 's/^PUBLIC_SCANS_ENABLED=.*/PUBLIC_SCANS_ENABLED=true/' /etc/accessbloom/accessbloom.env
else echo 'PUBLIC_SCANS_ENABLED=true' >> /etc/accessbloom/accessbloom.env;fi
systemctl restart accessbloom
curl -fsS http://127.0.0.1:4117/accessbloom/api/health
echo
echo '=== 6/7 Building portfolio frontend ==='
runuser -u lihvool -- bash -c 'cd /home/lihvool/viki && npm ci --no-audit --no-fund && npm run build'
echo '=== 7/7 Restart portfolio AI with root PM2 and validate Nginx ==='
if env PM2_HOME=/root/.pm2 pm2 describe portfolio-ai >/dev/null 2>&1; then
 env PM2_HOME=/root/.pm2 pm2 restart portfolio-ai
else
 echo 'Root PM2 process portfolio-ai was not found; leaving process unchanged.'
fi
nginx -t
systemctl reload nginx
echo
echo 'Deployment complete. Ensure the OpenAI API key and spending controls are configured separately.'
echo 'Portfolio: https://vik.ooo'
echo 'Scanner: https://vik.ooo/accessbloom/'
