# envvault

Keeps your `.env` files on your own VPS, automatically. `git push` uploads them; `git clone` / `git pull` restores them. Nothing but normal code goes to GitHub.

## Server (on the VPS)

```bash
cd server
cp .env.example .env
# fill ENVVAULT_TOKEN (openssl rand -hex 24) and ENVVAULT_MASTER_KEY (openssl rand -hex 32)
docker compose up -d --build
```

Put HTTPS in front of it (the container only listens on 127.0.0.1:8787). Caddy example:

```
env.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Back up the `envvault-data` volume **and** `ENVVAULT_MASTER_KEY` (files can't be decrypted without it). Runs without Docker too: `node server/src/index.js` with the same env vars (Node 20+).

## Client (each machine)

```bash
./client/install.sh     # asks for server URL + token, sets global core.hooksPath
```

After that it's automatic:

| Action | What happens |
| --- | --- |
| `git push` | every `.env*` file (nested too, except `.example/.sample/.template`) is uploaded first; a new version is stored only if content changed |
| `git clone` | missing `.env*` files are restored |
| `git pull` / merge | missing `.env*` files are restored (existing local files are never overwritten) |

Manual: `~/.envvault/bin/envvault push | pull [--force] | list`.

Notes:
- The project is identified by the normalized `origin` URL, so https and ssh remotes match.
- Upload failures (server down, etc.) never block your push; you get a warning.
- The hook warns if an env file is tracked by git or missing from `.gitignore`.
- The global hooks path replaces per-repo `.git/hooks`, so the hooks here chain to the repo's own hook. Tools like husky that set their own `core.hooksPath` per repo will bypass these hooks; call `envvault push` from them.
- Storage: AES-256-GCM per version, last 20 versions kept (`KEEP_VERSIONS`). Repeated bad tokens are rate-limited per IP.

## Test

`bash test/smoke.sh` runs server + install + push + clone in a temp dir (touches nothing global).
