# Badboy AI — Cloudflare-Only Build and Deployment Guide

Cloudflare Workers is the only supported backend and hosting deployment for this repository.

## Required toolchain

- Node.js 22
- pnpm 10.8.1 (the repository-pinned package manager)
- Wrangler 4 (installed in the root workspace)
- Java 17 and Android SDK for native Android builds

## Install and validate

Run from the repository root:

```sh
corepack enable
corepack prepare pnpm@10.8.1 --activate
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm --filter @workspace/functions test
pnpm --filter @workspace/mobile run test
pnpm build
```

The Expo web build is written to artifacts/mobile/dist. The root Worker serves those assets and the API from one deployment.

## Cloudflare Worker deployment

The canonical configuration is the root wrangler.json:

- Worker: badboy-vs-versel-ai
- Entry point: functions/api/[[path]].ts
- Static assets: artifacts/mobile/dist
- D1 binding: AGENT_DB → badboy-agent-db

Deploy from the repository root only:

```sh
pnpm run deploy
```

Do not use Cloudflare Pages, Netlify, Express, Docker API deployment, or a second Worker project. The root GitHub Actions deployment workflow deploys on pushes to main; PR validation does not deploy production.

## Server-side secrets

Configure credentials as Cloudflare Worker secrets/bindings. Never commit them or include them in Expo public configuration or APK assets.

- BADBOY_OWNER_TOKEN — required for owner-authenticated API access
- OPENROUTER_API_KEY — assistant chat and optional Developer Agent fallback
- GEMINI_API_KEY / GEMINI_MODEL — optional Developer Agent provider
- GROQ_API_KEY — optional primary speech transcription provider
- TAVILY_API_KEY — optional web research
- Integration credentials such as Home Assistant, Slack, Discord, and Google Calendar remain server-side

Apply D1 migrations only through the reviewed Cloudflare migration workflow. Do not run production migrations or deploy without explicit release authorization.

## Android APK

Use the repository's Android GitHub Actions workflows or run the documented Expo prebuild/Gradle steps from artifacts/mobile. An installable APK build is not the same as a verified physical-device test; microphone, wake-word, background service, and device-control behavior must still be checked on a real Android device.

## Local development

Use pnpm --filter @workspace/mobile dev for the Expo app and Wrangler's local Worker tooling when testing the API/assets integration. Do not start a separate API server: local API behavior must exercise the same Worker entry point used in deployment.
