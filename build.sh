#!/bin/sh
# Render Web Service build script
# Installs pnpm, installs all workspace deps, then builds:
#   1. The Vite / React frontend  → artifacts/netmesh/dist/public/
#   2. The Express API server     → artifacts/api-server/dist/index.mjs
set -e

# ── 1. Bootstrap pnpm ────────────────────────────────────────────────────────
# Render's Node 24 image ships with npm but not pnpm.
# corepack is bundled with Node 16+ and is the recommended way to manage
# package-manager versions without sudo / global writes.
corepack enable pnpm
corepack prepare pnpm@9 --activate

# ── 2. Install workspace dependencies ────────────────────────────────────────
pnpm install --frozen-lockfile

# ── 3. Build the React/Vite frontend ─────────────────────────────────────────
# PORT and BASE_PATH are required by vite.config.ts at config-load time.
# PORT=3000 is a placeholder (the static output never opens a port).
# BASE_PATH=/ serves the SPA from the root path of the Web Service.
PORT=3000 BASE_PATH=/ NODE_ENV=production \
  pnpm --filter @workspace/netmesh run build

# ── 4. Bundle the Express API server ─────────────────────────────────────────
pnpm --filter @workspace/api-server run build
