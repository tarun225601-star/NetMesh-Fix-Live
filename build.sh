#!/bin/sh
# Render Web Service build script
# Installs deps, then builds:
#   1. The Vite / React frontend  → artifacts/netmesh/dist/public/
#   2. The Express API server     → artifacts/api-server/dist/index.mjs
set -e

# ── 0. Always run from the repo root, regardless of the caller's CWD ─────────
# Every path below is relative to the repo root (where this script lives).
# If a host invokes this script from a different working directory (e.g. a
# misconfigured "Root Directory" setting), relative paths would silently
# resolve to the wrong place and produce files nothing else can find.
cd "$(dirname "$0")"
echo "==> Building in: $(pwd)"
echo "==> node: $(node -v)"

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
API_DIR="artifacts/api-server"
API_DIST="$API_DIR/dist"
API_ENTRY="$API_DIST/index.mjs"

echo "==> Building API server (@workspace/api-server)"
mkdir -p "$API_DIST"
$PNPM --filter @workspace/api-server run build

# The build.mjs esbuild step (artifacts/api-server/build.mjs) is what
# actually writes index.mjs — this call should never be needed in practice,
# but if some environment-specific issue silently no-ops the pnpm filter
# above (e.g. a caching quirk), rebuild directly from the package's own
# directory as a fallback so a missing dist/ doesn't fail silently.
if [ ! -f "$API_ENTRY" ]; then
  echo "==> $API_ENTRY missing after 'pnpm --filter' build, retrying directly in $API_DIR"
  (cd "$API_DIR" && node ./build.mjs)
fi

# ── 5. Verify the expected build outputs exist ───────────────────────────────
# If either of these is missing, the start command will fail with
# "Cannot find module" / "ERR_MODULE_NOT_FOUND" errors. Fail loudly here
# instead, with the build log pointing at the real cause.
echo "==> Verifying build output"

FRONTEND_ENTRY="artifacts/netmesh/dist/public/index.html"

if [ ! -f "$API_ENTRY" ]; then
  echo "ERROR: expected build output not found: $API_ENTRY" >&2
  echo "The API server build step ran but did not produce this file. Check the esbuild output above for errors." >&2
  echo "Directory listing of $API_DIST (or its nearest existing parent):" >&2
  ls -la "$API_DIST" 2>/dev/null || ls -la "$API_DIR" 2>/dev/null || ls -la . >&2
  exit 1
fi

if [ ! -f "$FRONTEND_ENTRY" ]; then
  echo "ERROR: expected build output not found: $FRONTEND_ENTRY" >&2
  echo "The frontend build step ran but did not produce this file. Check the vite build output above for errors." >&2
  exit 1
fi

echo "==> Build complete. Output:"
ls -la "$API_DIST"
ls -la artifacts/netmesh/dist/public
