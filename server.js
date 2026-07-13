// Standard Node.js entry point for hosting platforms (e.g. Render).
//
// This project is a pnpm monorepo. The real server lives at
// artifacts/api-server/src/index.ts and is bundled by esbuild into
// artifacts/api-server/dist/index.mjs (see build.sh). That bundled server
// handles both:
//   - the REST/WebSocket API under /api/*
//   - the built React frontend, served as static files from
//     artifacts/netmesh/dist/public/
//
// This file just gives hosting platforms a conventional root-level
// entry point ("node server.js") instead of requiring them to know the
// monorepo's internal build output path.
//
// Run `sh build.sh` first to produce the files this imports.
import "./artifacts/api-server/dist/index.mjs";
