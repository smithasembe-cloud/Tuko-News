---
name: OpenAPI validator compatibility
description: The workspace's generated API validators currently target Zod 3 syntax.
---

Keep OpenAPI schemas compatible with the validator version actually installed in this workspace; URI formats and integer shorthand can generate unavailable `zod.url()` and `zod.int()` calls. Prefer plain strings and numbers unless the generated output has been checked.

**Why:** The workspace generated those newer helpers during the first live-news contract and the library typecheck failed until the schema used compatible primitives.

**How to apply:** When adding OpenAPI fields, run codegen and the library typecheck before wiring new server or frontend code.