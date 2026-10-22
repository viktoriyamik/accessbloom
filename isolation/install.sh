#!/usr/bin/env bash
# Prepare isolated Playwright and outbound HTTPS proxy. Does not enable anonymous scans.
set -euo pipefail
cd "$(dirname "$0")/.."
docker info >/dev/null
docker network inspect accessbloom-scans-internal >/dev/null 2>&1 || docker network create --internal --driver bridge accessbloom-scans-internal
docker network inspect accessbloom-proxy-egress >/dev/null 2>&1 || docker network create --driver bridge accessbloom-proxy-egress
docker network inspect accessbloom-worker-control >/dev/null 2>&1 || docker network create --driver bridge accessbloom-worker-control
docker build -t accessbloom-egress-proxy:local -f isolation/proxy.Dockerfile isolation
docker build -t accessbloom-playwright-worker:local -f isolation/worker.Dockerfile isolation
docker rm -f accessbloom-egress-proxy accessbloom-browser-worker >/dev/null 2>&1 || true
docker run -d --name accessbloom-egress-proxy --restart unless-stopped --network accessbloom-scans-internal --cap-drop=ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --memory 96m --pids-limit 32 accessbloom-egress-proxy:local >/dev/null
docker network connect accessbloom-proxy-egress accessbloom-egress-proxy
# Block access from the isolated bridge to services listening on the VPS host.
bridge_id=$(docker network inspect accessbloom-scans-internal --format '{{.Id}}')
bridge="br-${bridge_id:0:12}"
control_id=$(docker network inspect accessbloom-worker-control --format '{{.Id}}')
control_bridge="br-${control_id:0:12}"
iptables -C INPUT -i "$bridge" -j REJECT 2>/dev/null || iptables -I INPUT 1 -i "$bridge" -j REJECT
iptables -C INPUT -i "$control_bridge" -j REJECT 2>/dev/null || iptables -I INPUT 1 -i "$control_bridge" -j REJECT
# Permit only replies to connections initiated by the VPS to the worker WebSocket port.
worker_ip=$(docker inspect accessbloom-browser-worker --format '{{with index .NetworkSettings.Networks "accessbloom-worker-control"}}{{.IPAddress}}{{end}}' 2>/dev/null || true)
if [[ -n "$worker_ip" ]]; then
 iptables -C INPUT -i "$control_bridge" -s "$worker_ip" -p tcp --sport 3000 -m conntrack --ctstate ESTABLISHED -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -i "$control_bridge" -s "$worker_ip" -p tcp --sport 3000 -m conntrack --ctstate ESTABLISHED -j ACCEPT
fi
iptables -C DOCKER-USER -i "$control_bridge" ! -o "$bridge" -j DROP 2>/dev/null || iptables -I DOCKER-USER 1 -i "$control_bridge" ! -o "$bridge" -j DROP
# Persist the host gateway firewall guard across reboots.
cat >/usr/local/sbin/accessbloom-bridge-guard <<'GUARD'
#!/bin/bash
set -euo pipefail
network_id=$(docker network inspect accessbloom-scans-internal --format '{{.Id}}')
iface="br-${network_id:0:12}"
control_id=$(docker network inspect accessbloom-worker-control --format '{{.Id}}')
control="br-${control_id:0:12}"
iptables -C INPUT -i "$iface" -j REJECT 2>/dev/null || iptables -I INPUT 1 -i "$iface" -j REJECT
iptables -C INPUT -i "$control" -j REJECT 2>/dev/null || iptables -I INPUT 1 -i "$control" -j REJECT
worker_ip=$(docker inspect accessbloom-browser-worker --format '{{with index .NetworkSettings.Networks "accessbloom-worker-control"}}{{.IPAddress}}{{end}}' 2>/dev/null || true)
if [[ -n "$worker_ip" ]]; then
 iptables -C INPUT -i "$control" -s "$worker_ip" -p tcp --sport 3000 -m conntrack --ctstate ESTABLISHED -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -i "$control" -s "$worker_ip" -p tcp --sport 3000 -m conntrack --ctstate ESTABLISHED -j ACCEPT
fi
iptables -C DOCKER-USER -i "$control" ! -o "$iface" -j DROP 2>/dev/null || iptables -I DOCKER-USER 1 -i "$control" ! -o "$iface" -j DROP
GUARD
chmod 0755 /usr/local/sbin/accessbloom-bridge-guard
cat >/etc/systemd/system/accessbloom-bridge-guard.service <<'UNIT'
[Unit]
Description=Block AccessBloom internal Docker network from VPS host
Requires=docker.service
After=docker.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/accessbloom-bridge-guard
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now accessbloom-bridge-guard.service

docker run -d --name accessbloom-browser-worker --restart unless-stopped --network accessbloom-worker-control --cap-drop=ALL --security-opt no-new-privileges --ipc=private --shm-size=256m --read-only --tmpfs /tmp:rw,nosuid,size=256m --memory 1000m --cpus 1.5 --pids-limit 200 -p 127.0.0.1:4120:3000 accessbloom-playwright-worker:local >/dev/null
docker network connect accessbloom-scans-internal accessbloom-browser-worker
# Docker does not publish ports on some --internal-only container networks; the
# control bridge publishes localhost while DOCKER-USER denies all outbound traffic.
echo 'Worker/proxy containers installed. Verify proxy policies and gateway isolation before enabling scans.'
echo 'Keep PUBLIC_SCANS_ENABLED=false until end-to-end isolation tests pass.'
