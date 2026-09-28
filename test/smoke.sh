#!/usr/bin/env bash
# End-to-end: server + install.sh + git push (upload) + git clone (restore). Fully isolated in a temp dir.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"
trap 'kill "${SRV:-0}" 2>/dev/null || true; rm -rf "$T"' EXIT

export HOME="$T/home"; mkdir -p "$HOME"
export GIT_CONFIG_GLOBAL="$HOME/.gitconfig"
git config --global user.email t@t; git config --global user.name t
git config --global init.defaultBranch main

PORT=$((20000 + RANDOM % 20000))
TOKEN=$(printf 'a%.0s' {1..32})
ENVVAULT_TOKEN=$TOKEN ENVVAULT_MASTER_KEY=$(printf '0123456789abcdef%.0s' {1..4}) \
  DATA_DIR="$T/data" PORT=$PORT HOST=127.0.0.1 node "$ROOT/server/src/index.js" >"$T/server.log" 2>&1 &
SRV=$!
for _ in $(seq 50); do curl -fs "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break; sleep 0.1; done

ENVVAULT_URL="http://127.0.0.1:$PORT" ENVVAULT_TOKEN=$TOKEN "$ROOT/client/install.sh" >/dev/null

git init -q --bare "$T/github.git"
git init -q "$T/proj"; cd "$T/proj"
git remote add origin "$T/github.git"
printf '.env*\n!.env.example\n' > .gitignore
echo 'SECRET=one' > .env
mkdir -p apps/web; echo 'WEB=1' > apps/web/.env.local
echo 'SECRET=' > .env.example
git add -A; git commit -qm init
git push -q origin main

echo "--- server has:"; "$HOME/.envvault/bin/envvault" list
[ "$(git ls-tree -r --name-only HEAD | grep -c '\.env$')" = 0 ] || { echo "FAIL: .env in git"; exit 1; }

echo 'SECRET=two' > .env
git commit -q --allow-empty -m bump; git push -q origin main

cd "$T"; git clone -q "$T/github.git" clone
[ "$(cat clone/.env)" = "SECRET=two" ] || { echo "FAIL: .env not restored/latest"; exit 1; }
[ "$(cat clone/apps/web/.env.local)" = "WEB=1" ] || { echo "FAIL: nested env not restored"; exit 1; }
[ -f clone/.env.example ] || { echo "FAIL: example missing"; exit 1; }

code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/v1/projects/$(printf 'a%.0s' {1..64})/files")
[ "$code" = 401 ] || { echo "FAIL: unauthenticated got $code"; exit 1; }
grep -rq 'SECRET' "$T/data" && { echo "FAIL: plaintext on disk"; exit 1; }

echo "PASS"
