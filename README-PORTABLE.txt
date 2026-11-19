Badboy AI — Cloudflare-Only Source Package

Start here: PORTABLE-DEPLOYMENT.md

Backend and web hosting are provided by the root Cloudflare Worker configured in wrangler.json. The Expo web build is served from artifacts/mobile/dist. There is no Netlify Functions or standalone Express API deployment.

Install and validate from the repository root with Node.js 22 and pnpm 10.8.1:

  pnpm install --frozen-lockfile
  pnpm run typecheck
  pnpm --filter @workspace/functions test
  pnpm --filter @workspace/mobile run test
  pnpm build

Keep provider credentials in Cloudflare Worker secrets. Do not place real keys in .env files, frontend variables, APK assets, or source control.
