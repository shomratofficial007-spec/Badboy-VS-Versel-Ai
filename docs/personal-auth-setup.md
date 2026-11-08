# Badboy personal-owner authentication

This is a card-free, single-owner authentication foundation for a personal Badboy deployment. It uses Cloudflare Workers' built-in Web Crypto API and one Worker secret; it does not require Google Cloud, Cloudflare Zero Trust, Firebase, or a paid identity provider.

## Configure the Worker secret

1. Generate a high-entropy URL-safe key on a trusted local device:

   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

2. In Cloudflare Dashboard, open **Workers & Pages → badboy-vs-versel-ai → Settings → Variables and Secrets**.
3. Add a **Secret** named `BADBOY_OWNER_TOKEN` and paste the generated value directly into the Cloudflare secret field.
4. Do not paste the key into GitHub, source code, chat, screenshots, or logs.

Enter the same key in Badboy's Owner Login screen. On Android/iOS it is stored with Expo SecureStore; it is never written to AsyncStorage, source code, or logs. On web, the key remains in memory for the current page session because SecureStore is not available there.

## Current API contract

- `POST /api/auth/verify` with `Authorization: Bearer <key>` returns `{ "authenticated": true }`.
- Every other API route requires the same bearer token, including Chat, Developer Analysis, Transcription, Speech, and Developer Agent health.
- Only `GET /api/health`, `GET /api/healthz`, CORS preflight, and the token verifier are public.
- Missing Worker configuration returns 503 (fail closed); missing or invalid credentials return 401.
- The verifier assigns the fixed server-side owner key `badboy-personal-owner-v1`; client-supplied owner IDs are ignored.
- Authentication errors include no-store and CORS headers. The endpoint never returns the owner key or credential and never logs either.

## Private Developer Agent D1 data

The authenticated Worker now exposes owner-scoped Developer Agent data routes:

- `GET/POST /api/developer/tasks` — list and create task records.
- `GET/POST /api/developer/projects` — list and upsert the owner's projects.
- `GET/POST/DELETE /api/developer/project-memory` — list, add, and delete project notes.
- Each Developer Agent analysis creates a private D1 task record and records its completed/failed lifecycle.
- The server derives the owner ID from the verified `BADBOY_OWNER_TOKEN`; client-supplied `ownerId` values are ignored.
- Task, project, and project-memory queries are scoped by that server-derived owner ID. A project memory cannot be attached to another owner's project.
- These D1 records are separate from Chat History and personal Memory, which remain in the app's existing on-device storage.

### Apply the additive D1 migration

The migration file is `migrations/0001_agent_persistence.sql`. It only creates Developer Agent tables and indexes; it does not migrate or delete existing mobile-local data.

After reviewing the migration and confirming the intended Cloudflare database, apply it deliberately from a trusted local environment:

`pnpm exec wrangler d1 migrations apply badboy-agent-db --remote`

Do not run this against an unintended database. Until the migration is applied, private D1 endpoints return a storage/database error and Developer Agent analysis cannot persist its task record. No remote migration is run automatically by CI.

## Security and rollout boundaries

- The key is a long-lived bearer credential. Anyone who obtains it can act as the personal owner until it is rotated. Keep it private.
- Rotate/revoke it by replacing the Worker secret, then sign in again on trusted devices.
- Send it only over HTTPS. Do not put it in URL parameters.
- Chat History and personal Memory remain on-device in their existing storage; owner login does not migrate or clear them.
- Developer Agent D1 persistence routes are protected by the owner token and store only owner-scoped Developer Agent tasks, projects, and project notes. No D1 migration is applied remotely by CI.
- No production deployment, merge, or APK build is performed.
