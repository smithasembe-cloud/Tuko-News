---
name: pnpm workspace annotations
description: Preserve human-written security and compatibility notes in the workspace YAML when updating dependencies.
---

After pnpm commands that rewrite `pnpm-workspace.yaml`, inspect the diff and restore important comments. In particular, retain the explanation for the minimum release age and any compatibility notes attached to overrides.

**Why:** pnpm 10.26.1 reserialized the workspace file during dependency updates and removed existing comments even though the settings remained active.

**How to apply:** Use pnpm for dependency updates, then review both the lockfile and workspace YAML diff before accepting the change.
