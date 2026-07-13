---
name: Imported project has artifact.toml but not registered
description: What to do when a GitHub-imported pnpm-workspace project already has artifacts/*/.replit-artifact/artifact.toml files on disk, but listArtifacts() and listWorkflows() both return empty and WorkflowsRestart says the workflow "doesn't exist in config".
---

Symptom: project was clearly built on Replit before (has `artifacts/<slug>/.replit-artifact/artifact.toml`, `pnpm-workspace.yaml`, `.replit` with `[agent] stack = "PNPM_WORKSPACE"`), but after a fresh GitHub import `listArtifacts()` returns `[]`, `listWorkflows()` returns `[]`, and `WorkflowsRestart` fails with "doesn't exist in config" for the expected `artifacts/<slug>: <service>` name. The artifact registry (and derived workflow config) is a separate DB-backed layer from the files on disk, and a fresh import doesn't automatically re-populate it from existing `artifact.toml` files.

**Fix:** for each artifact, copy its `artifact.toml` to a sibling `artifact.edit.toml` (unchanged content is fine) and call `verifyAndReplaceArtifactToml({ tempFilePath, artifactTomlPath })` from CodeExecution. This re-registers the artifact and auto-creates its managed workflow(s), after which `WorkflowsRestart` works normally. Clean up the temp `.edit.toml` files afterward.

**Why:** `createArtifact()` can't be used here — it fails with "slug already exists" for a directory that's already fully built out, and would try to scaffold from `files/` templates, not preserve real source.
