#!/usr/bin/env bash
# Installs the envvault CLI and global git hooks for this user.
# Usage: ENVVAULT_URL=https://env.example.com ENVVAULT_TOKEN=... ./install.sh   (or run and answer prompts)
set -eu

SRC="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="${ENVVAULT_HOME:-$HOME/.envvault}"

mkdir -p "$HOME_DIR/bin" "$HOME_DIR/hooks"
cp "$SRC/bin/envvault" "$HOME_DIR/bin/envvault"
cp "$SRC/hooks/"* "$HOME_DIR/hooks/"
chmod +x "$HOME_DIR/bin/envvault" "$HOME_DIR/hooks/"*

url="${ENVVAULT_URL:-}"
token="${ENVVAULT_TOKEN:-}"
if [ -z "$url" ]; then read -r -p "Server URL (e.g. https://env.example.com): " url; fi
if [ -z "$token" ]; then read -r -s -p "Token: " token; echo; fi

umask 077
printf 'ENVVAULT_URL=%q\nENVVAULT_TOKEN=%q\n' "${url%/}" "$token" > "$HOME_DIR/config"

current=$(git config --global core.hooksPath || true)
if [ -n "$current" ] && [ "$current" != "$HOME_DIR/hooks" ]; then
  echo "core.hooksPath is already set to '$current'." >&2
  echo "Copy $HOME_DIR/hooks/* into it (or call '$HOME_DIR/bin/envvault push|pull' from your hooks) instead." >&2
else
  git config --global core.hooksPath "$HOME_DIR/hooks"
fi

if curl -fsS --max-time 8 "${url%/}/healthz" >/dev/null 2>&1; then
  echo "Server reachable. Installed to $HOME_DIR."
else
  echo "Installed to $HOME_DIR, but the server at $url is not reachable right now." >&2
fi
echo "Optional: add $HOME_DIR/bin to PATH to use 'envvault push|pull|list' manually."
