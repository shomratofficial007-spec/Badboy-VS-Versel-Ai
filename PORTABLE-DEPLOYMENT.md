# Voice-Memory-Assistant — Portable Build Guide

This archive is prepared to be easier to import into GitHub Codespaces, Gitpod, Replit, StackBlitz (if its runtime supports this workspace), or another Node.js development environment. No source archive can guarantee a successful build on *every* website: hosting platforms have different runtimes and some only host static files.

## Runtime

- Node.js 22 LTS recommended
- pnpm 10 recommended (this is a pnpm workspace and uses `workspace:` and `catalog:` dependencies)
- Install dependencies from the repository root with `pnpm install --no-frozen-lockfile` on the first install if a host's package registry/lockfile resolution differs.

## Build commands

From the repository root:

```sh
corepack enable
corepack prepare pnpm@10.8.1 --activate
pnpm install --no-frozen-lockfile
pnpm run build
```

If the all-workspace build fails, build the web app independently:

```sh
pnpm --filter @workspace/mobile build
```

That command produces the Expo web export in `artifacts/mobile/dist` outside Replit. The mockup preview can be built with:

```sh
PORT=4173 BASE_PATH=/ pnpm --filter @workspace/mockup-sandbox build
```

## Deployment reality

- **Static web app:** deploy `artifacts/mobile/dist` on a static host after its build succeeds.
- **API server:** `artifacts/api-server` is a separate Node.js service. Deploy it on a Node-compatible server host; a static-only host cannot run it by itself without adapting routes to that host's serverless-function format.
- **Database:** set `DATABASE_URL` only if the selected features require the database and a compatible PostgreSQL database is provisioned.
- **AI:** set `GEMINI_API_KEY` as a server-side secret to enable the Developer Agent's Gemini adapter (default model: `gemini-3.5-flash-lite`). Optionally set `GEMINI_MODEL` to another model available to your Google AI Studio project. The Native AI Engine remains the controller and tries Gemini first; if Gemini is unavailable or rate-limited, it uses `OPENROUTER_API_KEY` and the existing free-model fallbacks when configured. The ordinary assistant chat route continues to use OpenRouter. Never put API keys in frontend/public environment variables or commit them to the repository. The Developer Agent returns 503 when neither provider key is configured.
- **Frontend-to-API URL:** configure the frontend/API base URL to match the public URL of the separately deployed API. A host-specific rewrite may be needed.

## Platform-specific notes

- **Cloudflare Pages:** Deploy as **Cloudflare Pages** (not Cloudflare Workers) using the `wrangler.json` configuration.
  - **Important:** Ensure the project in Cloudflare Dashboard is created under **Workers & Pages > Create > Pages > Connect to Git** (do NOT choose Workers or Worker Builds). Standard `npx wrangler deploy` is meant for Cloudflare Workers and fails in monorepo roots with `The Cloudflare application detection logic has been run in the root of a workspace instead of targeting a specific project.`
  - **Framework preset:** `None` (or `Custom`).
  - **Root Directory:** `/` (repo root). *This allows Cloudflare Pages to detect both the build output in `artifacts/mobile/dist` and the serverless functions in `/functions/api/[[path]].ts`.*
  - **Build Command:** `pnpm run build`
  - **Build Output Directory:** `artifacts/mobile/dist`
  - **Environment Variables:**
    - `NODE_VERSION`: `22`
    - `PNPM_VERSION`: `10.8.1`
    - `OPENROUTER_API_KEY`: `<your_openrouter_api_key>` (required for the existing assistant chat route and optional Developer Agent fallback).
    - `GEMINI_API_KEY`: `<your_google_ai_studio_api_key>` (server-side secret; enables Gemini for the Developer Agent).
    - `GEMINI_MODEL`: `gemini-3.5-flash-lite` (optional; defaults to this model).
  - **CLI Deploy Command:** `pnpm run deploy` or `npx wrangler pages deploy ./artifacts/mobile/dist --project-name voice-memory-assistant-net`
- Netlify can host the static frontend, but this workspace's Express API is not automatically converted into Netlify Functions by uploading the ZIP. The API needs a Node host or a deliberate serverless adapter.
- Vercel, Render, Railway, Fly.io, GitHub Actions, Codespaces, and similar platforms have different project-root, build, start, environment-variable, and database settings. Configure those according to the chosen host.
- The Expo native Android/iOS app is different from its web export; producing an installable Android/iOS build requires the relevant Expo/EAS or native build pipeline.

## What was made portable

- Removed the repository's `.git` history and generated local caches from this source archive.
- Made the mockup Vite configuration use safe defaults when `PORT` or `BASE_PATH` is not supplied.
- Added a non-Replit Expo web-export path to the mobile build script; the existing Replit-specific build path remains available when Replit environment variables are detected.

This archive has not been verified by a successful clean install and production build on every hosting provider. Run the commands above and use the first build error to make host-specific corrections.
