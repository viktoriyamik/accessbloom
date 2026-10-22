#!/usr/bin/env bash
# Upgrade only isolated Playwright worker to match the existing 1.64 client.
set -Eeuo pipefail
[[ $(id -u) -eq 0 ]] || { echo 'Run with sudo'; exit 1; }
cd /home/lihvool/accessbloom
echo '=== Building matching Playwright 1.64 worker ==='
docker build -t accessbloom-playwright-worker:local -f isolation/worker.Dockerfile isolation
echo '=== Replacing only the browser worker; egress proxy remains running ==='
docker rm -f accessbloom-browser-worker >/dev/null 2>&1 || true
docker run -d --name accessbloom-browser-worker --restart unless-stopped --network accessbloom-worker-control --cap-drop=ALL --security-opt no-new-privileges --ipc=private --shm-size=256m --read-only --tmpfs /tmp:rw,nosuid,size=256m --memory 1000m --cpus 1.5 --pids-limit 200 -p 127.0.0.1:4120:3000 accessbloom-playwright-worker:local >/dev/null
docker network connect accessbloom-scans-internal accessbloom-browser-worker
/usr/local/sbin/accessbloom-bridge-guard
echo '=== Checking actual WebSocket protocol compatibility ==='
bash scripts/fix-browser-connection.sh
echo '=== Testing public HTTPS and private-address restriction through Playwright ==='
node scripts/check-isolation.mjs
echo 'PASS: worker/browser protocol and smoke test.'
