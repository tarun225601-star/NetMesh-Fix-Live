# NetMesh

A link-sharing and user profile platform. Users can share links, manage their link library, and share a public profile URL with others.

Note: the current UI copy/branding leans into a "P2P internet tunnel" framing (WebRTC relay/worker language) rather than plain link sharing — that's existing product content, not a setup issue.

## Run & Operate

- `pnpm --filter @workspace/netmesh run dev` — run the frontend (Vite, port from $PORT)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite 6, Tailwind CSS v4, shadcn/ui, wouter (routing), TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)

## Where things live

```
artifacts/netmesh/src/
  App.tsx                   ← Router + providers (entry point)
  layouts/
    MainLayout.tsx          ← Sidebar nav + mobile header
  pages/
    Dashboard.tsx           ← / (dashboard overview)
    ShareLink.tsx           ← /share (create new share)
    MyLinks.tsx             ← /links (manage saved links)
    Profile.tsx             ← /profile/:username (public profile)
    Settings.tsx            ← /settings
    not-found.tsx           ← 404
  components/ui/            ← shadcn/ui component library
  index.css                 ← CSS theme variables + Tailwind
lib/api-spec/openapi.yaml   ← OpenAPI source of truth
artifacts/api-server/src/   ← Express routes
lib/db/src/schema/          ← Drizzle schema
```

## Architecture decisions

- Wouter used instead of React Router; base path comes from `import.meta.env.BASE_URL`
- `PORT` and `BASE_PATH` are injected by the workflow — never hardcode them
- `server.allowedHosts: true` in vite.config.ts — required for Replit's proxied iframe
- Sidebar layout uses `bg-sidebar` / `border-sidebar-border` tokens from CSS theme

## Product

- **Dashboard** — overview of recent shares and activity
- **Share Link** — create a new shareable link (with optional metadata, tags)
- **My Links** — searchable/filterable list of all user links
- **Profile** — public page at `/profile/:username` — shareable URL showing a user's links
- **Settings** — account and display preferences

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After editing OpenAPI spec, always re-run codegen before using hooks in frontend
- Do not run `pnpm dev` at the workspace root — use workflow or `--filter` instead
- Verify with `pnpm --filter @workspace/netmesh run typecheck`, not `build` (build needs workflow env vars)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `react-vite` skill for frontend build workflow and design subagent delegation
