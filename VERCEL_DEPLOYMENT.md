# Deploying Mwangaza Wire to Vercel

This repository is a pnpm monorepo. Import the repository from GitHub with the
repository root as Vercel's **Root Directory**. Do not set the root to
`artifacts/tuko-news`: the shared workspace packages and the API function live
outside that folder.

The checked-in `vercel.json` sets the install command, typecheck/build command,
static output directory, and SPA fallback. The build also bundles the Express
app before Vercel compiles `api/[...path].ts`, which forwards `/api/*` requests
to that app. Vercel's file-system routes take precedence over the SPA rewrite.

## Required project setup

- Add `DATABASE_URL` to Vercel's Environment Variables for each environment
  where the API should run. It must point to a PostgreSQL database reachable
  from Vercel, with the `news_articles` table provisioned from this project's
  database schema. The API exits during initialization if this variable is
  absent.
- `GEMINI_API_KEY` is optional. Without it, the API uses deterministic news
  ordering and its non-AI summary fallback.
- Keep Vercel's Root Directory at the repository root. The pnpm version is
  pinned in the root `package.json`.

The Vite build can be checked locally without Replit-specific settings:

```sh
env -u PORT -u BASE_PATH pnpm --filter @workspace/tuko-news run build
```

The production database, Vercel environment variables, and live Vercel
deployment still need to be configured and verified in the Vercel project.
