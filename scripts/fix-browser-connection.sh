#!/usr/bin/env bash
# Repair AccessBloom remote browser connectivity without changing firewall, Docker or Nginx.
set -Eeuo pipefail
[[ $(id -u) -eq 0 ]] || { echo "Run with sudo"; exit 1; }
cd /home/lihvool/accessbloom
ip=$(docker inspect accessbloom-browser-worker --format '{{with index .NetworkSettings.Networks "accessbloom-worker-control"}}{{.IPAddress}}{{end}}')
[[ $ip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Browser control IP unavailable"; exit 1; }
control_id=$(docker network inspect accessbloom-worker-control --format '{{.Id}}')
iface="br-${control_id:0:12}"
echo "Allowing only established Playwright WebSocket replies from $ip:3000..."
iptables -C INPUT -i "$iface" -s "$ip" -p tcp --sport 3000 -m conntrack --ctstate ESTABLISHED -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -i "$iface" -s "$ip" -p tcp --sport 3000 -m conntrack --ctstate ESTABLISHED -j ACCEPT
echo "Testing browser through its dedicated control bridge..."
BROWSER_WS="ws://$ip:3000/" node --input-type=module -e '
import {chromium} from "playwright";
const browser=await chromium.connect(process.env.BROWSER_WS,{timeout:12000});
await browser.close();
console.log("PASS: Playwright WebSocket handshake");
'
echo "Updating browser address (existing API key and other settings preserved)..."
envfile=/etc/accessbloom/accessbloom.env
cp -a "$envfile" "/etc/accessbloom/accessbloom.env.backup.$(date +%Y%m%d%H%M%S)"
sed -i '/^AUDIT_BROWSER_WS=/d' "$envfile"
printf '\nAUDIT_BROWSER_WS=ws://%s:3000/\n' "$ip" >> "$envfile"
systemctl restart accessbloom
curl --fail --silent http://127.0.0.1:4117/accessbloom/api/health
echo
echo "PASS: AccessBloom connected to the browser control network. Run a website scan to check navigation and proxy."
