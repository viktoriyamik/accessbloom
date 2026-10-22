#!/usr/bin/env bash
# Prepare isolated Playwright and outbound HTTPS proxy. Does not enable anonymous scans.
set -euo pipefail
cd "$(dirname "$0")/.."
docker info >/dev/null
docker network inspect accessbloom-scans-internal >/dev/null 2>&1 || docker network create --internal --driver bridge accessbloom-scans-internal
docker network inspect accessbloom-proxy-egress >/dev/null 2>&1 || docker network create --driver bridge accessbloom-proxy-egress
docker build -t accessbloom-egress-proxy:local -f isolation/proxy.Dockerfile isolation
docker build -t accessbloom-playwright-worker:local -f isolation/worker.Dockerfile isolation
docker rm -f accessbloom-egress-proxy accessbloom-browser-worker >/dev/null 2>&1 || true
docker run -d --name accessbloom-egress-proxy --restart unless-stopped --network accessbloom-scans-internal --cap-drop=ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --memory 96m --pids-limit 32 accessbloom-egress-proxy:local >/dev/null
docker network connect accessbloom-proxy-egress accessbloom-egress-proxy
# Block access from the isolated bridge to services listening on the VPS host.
bridge_id=$(docker network inspect accessbloom-scans-internal --format '{{.Id}}')
bridge="br-${bridge_id:0:12}"
iptables -C INPUT -i "$bridge" -j REJECT 2>/dev/null || iptables -I INPUT 1 -i "$bridge" -j REJECT

docker run -d --name accessbloom-browser-worker --restart unless-stopped --network accessbloom-scans-internal --cap-drop=ALL --security-opt no-new-privileges --ipc=private --shm-size=256m --read-only --tmpfs /tmp:rw,nosuid,size=256m --memory 1000m --cpus 1.5 --pids-limit 200 -p 127.0.0.1:4120:3000 accessbloom-playwright-worker:local >/dev/null
echo 'Worker/proxy containers installed. Verify proxy policies and gateway isolation before enabling scans.'
echo 'Keep PUBLIC_SCANS_ENABLED=false until end-to-end isolation tests pass.'
