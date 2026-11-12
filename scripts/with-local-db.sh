#!/bin/bash
# Run a command with the LOCAL database settings. Usage: scripts/with-local-db.sh dev|test <command...>
# Example: scripts/with-local-db.sh test npm run test:db
# Reads the git-ignored files .env.atiana-local (dev) or .env.atiana-test (test) and stops if the host is not local.
cd "$(dirname "$0")/.." || exit 1
case "$1" in dev) f=.env.atiana-local ;; test) f=.env.atiana-test ;; *) echo "usage: $0 dev|test <command...>"; exit 2 ;; esac
shift
[ -f "$f" ] || { echo "missing $f"; exit 2; }
set -a; . "./$f"; set +a
for v in DATABASE_URL DIRECT_URL; do
  h=$(echo "${!v}" | sed -E 's#^[a-z]+://[^@]*@([^:/?]+).*#\1#')
  echo "[$v host: $h]"
  case "$h" in localhost|127.0.0.1) ;; *) echo "NOT LOCAL - STOP"; exit 9 ;; esac
done
exec "$@"
