# Badboy AI development workspace

## Run and validate

- pnpm --filter @workspace/mobile dev — start the Expo development app
- pnpm run typecheck — typecheck the maintained workspace
- pnpm --filter @workspace/functions test — run Cloudflare Worker API tests
- pnpm --filter @workspace/mobile run test — run mobile tests
- pnpm build — build the Expo web assets and validate the workspace
- pnpm run deploy — deploy the single root Cloudflare Worker (production deployment; use only with release authorization)

## Architecture

- Hosting and backend: root Cloudflare Worker (wrangler.json)
- Worker entry: functions/api/[[path]].ts
- Web assets: artifacts/mobile/dist
- Database: Cloudflare D1 binding AGENT_DB
- Secrets: Cloudflare Worker secrets; never expose them to the mobile bundle
- Do not add Netlify Functions, a standalone Express API, Cloudflare Pages, or a second hosting target.

## Important

Run local development and tests freely. Do not deploy to production, change Worker secrets, or apply production D1 migrations without explicit release authorization.
