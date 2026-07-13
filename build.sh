#!/bin/sh
# Render build script — runs on Render's Linux build image
# Bootstraps pnpm (not pre-installed on Render) then builds the Vite frontend.
set -e

npm install -g pnpm@9
pnpm install --frozen-lockfile
pnpm --filter @workspace/netmesh run build
