# Tuko News Reader

Tuko News Reader is a live, image-led news reader for Kenya and the wider world with transparent publisher attribution and reader-friendly AI briefs.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/tuko-news/src/` — React reader shell, homepage, article view, and editorial components
- `artifacts/api-server/src/routes/news.ts` — RSS aggregation, source metadata, Kenya-first AI curation, four-minute cache, and optional Gemini summaries
- `lib/api-spec/openapi.yaml` — source of truth for live news and summary contracts
- `artifacts/tuko-news/src/index.css` — Tuko visual system, typography, motion, and responsive layout

## Architecture decisions

- Live stories are read from publisher RSS feeds server-side so the browser avoids cross-origin feed issues and every article retains a direct source URL.
- The frontend polls the feed and trending rail every five minutes; the API keeps a short in-memory cache to avoid hammering publishers.
- AI curation and summaries use `GEMINI_API_KEY` only when provided; deterministic ordering and a clearly labeled editorial brief keep the reader experience working without inventing content.
- Missing publisher images use a real image already present in the live edition so story cards remain filled without generated imagery.

## Product

Readers can browse live stories by section, search the edition, save stories locally, open readable article pages, share links, see trending coverage, and request a short AI-generated brief. Articles always show their original publisher and include a clear link to the full report.

## User preferences

- Use real publisher reporting and real article imagery only; never use fake stories or unrelated image placeholders.
- Keep third-party attribution and original-source links clear rather than disguising the source.

## Gotchas

- The current OpenAPI generator targets Zod 3 syntax, so URL and integer schema formats should remain compatible with that generated validator.
- RSS publishers can fail independently; the API intentionally returns the stories from feeds that are reachable.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
