#!/bin/sh
# Render Web Service build script
# Installs deps, then builds:
#   1. The Vite / React frontend  → artifacts/netmesh/dist/public/
#   2. The Express API server     → artifacts/api-server/dist/index.mjs
set -e

# ── 1. Get pnpm without touching global bin/symlinks ────────────────────────
# `corepack enable` writes shims into the global npm bin directory, which
# fails with EACCES on some hosting images (the build user doesn't have
# write access there). `npx --yes pnpm@9` downloads pnpm into npx's local
# cache instead, so it works regardless of global permissions.
PNPM="npx --yes pnpm@9"
echo "==> Using: $PNPM ($($PNPM --version))"

# ── 2. Install workspace dependencies ────────────────────────────────────────
echo "==> Installing workspace dependencies"
$PNPM install --frozen-lockfile

# ── 3. Build the React/Vite frontend ─────────────────────────────────────────
# PORT and BASE_PATH are required by vite.config.ts at config-load time.
# PORT=3000 is a placeholder (the static output never opens a port).
# BASE_PATH=/ serves the SPA from the root path of the Web Service.
echo "==> Building frontend (@workspace/netmesh)"
PORT=3000 BASE_PATH=/ NODE_ENV=production \
  $PNPM --filter @workspace/netmesh run build

# ── 4. Bundle the Express API server ─────────────────────────────────────────
echo "==> Building API server (@workspace/api-server)"
$PNPM --filter @workspace/api-server run build

# ── 5. Verify the expected build outputs exist ───────────────────────────────
# If either of these is missing, the start command will fail with
# "Cannot find module" / "module not found" errors. Fail loudly here instead,
# with the build log pointing at the real cause.
echo "==> Verifying build output"

API_ENTRY="artifacts/api-server/dist/index.mjs"
FRONTEND_ENTRY="artifacts/netmesh/dist/public/index.html"

if [ ! -f "$API_ENTRY" ]; then
  echo "ERROR: expected build output not found: $API_ENTRY" >&2
  echo "The API server build step ran but did not produce this file. Check the esbuild output above for errors." >&2
  exit 1
fi

if [ ! -f "$FRONTEND_ENTRY" ]; then
  echo "ERROR: expected build output not found: $FRONTEND_ENTRY" >&2
  echo "The frontend build step ran but did not produce this file. Check the vite build output above for errors." >&2
  exit 1
fi

echo "==> Build complete. Output:"
ls -la artifacts/api-server/dist
ls -la artifacts/netmesh/dist/public
