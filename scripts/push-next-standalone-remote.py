#!/usr/bin/env python3
"""
Upload repo-root deploy-web-standalone.tar.gz (build: cd web && npm run build)
and extract into /var/www/ipt/web/.next/standalone on the server, then restart kotc-web.

Usage (password only in argv / env — never commit):
  py scripts/push-next-standalone-remote.py <host> <ssh_password>

Or: set DEPLOY_SSH_PASSWORD and pass only host:
  py scripts/push-next-standalone-remote.py <host>

Requires: pip install paramiko
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("Install paramiko: py -m pip install paramiko", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
LOCAL_TAR = ROOT / "deploy-web-standalone.tar.gz"
REMOTE_TAR = "/tmp/deploy-web-standalone.tar.gz"
REMOTE_NEXT = "/var/www/ipt/web/.next"
REMOTE_STANDALONE = f"{REMOTE_NEXT}/standalone"
REMOTE_BACKUP_DIR = "/var/www/ipt/.deploy-backup"


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: push-next-standalone-remote.py <host> [ssh_password]", file=sys.stderr)
        sys.exit(1)
    host = sys.argv[1].strip()
    pw = (sys.argv[2] if len(sys.argv) > 2 else os.environ.get("DEPLOY_SSH_PASSWORD", "")).strip()
    if not pw:
        print("missing password: pass as 2nd arg or set DEPLOY_SSH_PASSWORD", file=sys.stderr)
        sys.exit(1)
    if not LOCAL_TAR.is_file():
        print(f"missing {LOCAL_TAR} — run: cd web && npm run build && tar -czf ../deploy-web-standalone.tar.gz -C .next/standalone .", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        host,
        username="root",
        password=pw,
        timeout=90,
        allow_agent=False,
        look_for_keys=False,
    )

    stdin, stdout, stderr = client.exec_command(
        f"test -d /var/www/ipt/web || (echo 'MISSING /var/www/ipt/web' && exit 2); "
        f"test -f {REMOTE_STANDALONE}/web/server.js || echo 'WARN_NO_OLD_SERVER'; "
        f"echo PROBE_OK"
    )
    probe = stdout.read().decode(errors="replace")
    err_probe = stderr.read().decode(errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        print(probe, err_probe)
        client.close()
        sys.exit(code)

    sftp = client.open_sftp()
    print(f"upload {LOCAL_TAR.name} -> {host}:{REMOTE_TAR} …")
    sftp.put(str(LOCAL_TAR), REMOTE_TAR)
    sftp.close()

    script = f"""set -e
mkdir -p "{REMOTE_BACKUP_DIR}"
if [ -d "{REMOTE_STANDALONE}" ]; then
  ts=$(date +%Y%m%d-%H%M%S)
  tar -czf "{REMOTE_BACKUP_DIR}/standalone-$ts.tar.gz" -C "{REMOTE_NEXT}" standalone || true
fi
rm -rf "{REMOTE_STANDALONE}"
mkdir -p "{REMOTE_STANDALONE}"
tar -xzf "{REMOTE_TAR}" -C "{REMOTE_STANDALONE}"
rm -f "{REMOTE_TAR}"
chown -R www-data:www-data "{REMOTE_STANDALONE}" || true
for svc in kotc-web kotc-web.service; do
  if systemctl list-unit-files "$svc" 2>/dev/null | grep -q enabled; then
    systemctl restart "$svc" && echo "restarted $svc" && break
  fi
done
sleep 2
curl -sI http://127.0.0.1:3101/ 2>/dev/null | head -8 || true
echo DEPLOY_DONE
"""
    stdin, stdout, stderr = client.exec_command(script)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    print(out)
    if err.strip():
        print("STDERR:", err, file=sys.stderr)
    exit_code = stdout.channel.recv_exit_status()
    client.close()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
