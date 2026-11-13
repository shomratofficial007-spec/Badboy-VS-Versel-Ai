# Badboy personal-owner authentication

This is a card-free, single-owner authentication foundation for a personal Badboy deployment. It uses Cloudflare Workers' built-in Web Crypto API and one Worker secret; it does not require Google Cloud, Cloudflare Zero Trust, Firebase, or a paid identity provider.

## Configure the Worker secret

1. Generate a high-entropy URL-safe key on a trusted local device:

   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

2. In Cloudflare Dashboard, open **Workers & Pages → badboy-vs-versel-ai → Settings → Variables and Secrets**.
3. Add a **Secret** named `BADBOY_OWNER_TOKEN` and paste the generated value directly into the Cloudflare secret field.
4. Do not paste the key into GitHub, source code, chat, screenshots, or logs.

Enter the key in Badboy's Owner Login screen. The Worker exchanges it once for a random 256-bit session token. The Owner Token is never persisted by the app; only the session token is stored in Android/iOS Expo SecureStore (or in memory on web).

## Session API contract

- `POST /api/auth/session` accepts the Owner Token once and returns a random opaque session token plus its expiry.
- `GET /api/auth/session` validates the session on the Badboy Worker.
- `DELETE /api/auth/session` revokes the current session (Logout).
- Every other private API route accepts only the session token; the Owner Token is not accepted or rechecked there.
- Sessions expire after 30 days. Expired/revoked sessions return 401 and require Owner Login again.
- The Worker stores only a SHA-256 hash of each session token in D1; the raw session token is stored only in the app's SecureStore.
- Authentication/session operations do not call Gemini, OpenRouter, Groq, or any AI provider. Provider quota is used only when an AI feature actually invokes that provider.
- Session creation fails closed with 503 until the additive `0002_owner_sessions.sql` migration has been applied to the configured D1 database.

## Private Developer Agent D1 data

The authenticated Worker now exposes owner-scoped Developer Agent data routes:

- `GET/POST /api/developer/tasks` — list and create task records.
- `GET/POST /api/developer/projects` — list and upsert the owner's projects.
- `GET/POST/DELETE /api/developer/project-memory` — list, add, and delete project notes.
- Each Developer Agent analysis creates a private D1 task record and records its completed/failed lifecycle.
- The server derives the owner ID from the verified session; client-supplied `ownerId` values are ignored.
- Task, project, and project-memory queries are scoped by that server-derived owner ID. A project memory cannot be attached to another owner's project.
- These D1 records are separate from Chat History and personal Memory, which remain in the app's existing on-device storage.
- Owner project notes with `private` or `general` privacy levels may be included in Developer Agent analysis context; notes marked `sensitive` are excluded from AI requests.

### Apply the additive D1 migration

The migrations are `migrations/0001_agent_persistence.sql` (Developer Agent data) and `migrations/0002_owner_sessions.sql` (hashed, revocable owner sessions). Both are additive and do not migrate or delete existing mobile-local data.

After reviewing the migration and confirming the intended Cloudflare database, apply it deliberately from a trusted local environment:

`pnpm exec wrangler d1 migrations apply badboy-agent-db --remote`

Do not run this against an unintended database. Until both migrations are applied, session login fails closed and Developer Agent D1 endpoints cannot persist task records. No remote migration is run automatically by CI.

## Security and rollout boundaries

- The Owner Token is used only to create a session. Anyone who obtains an active session token can act as the personal owner until it expires or is revoked. Keep device storage protected.
- Revoke a device session with Logout. Replacing the Worker Owner Token prevents future logins with the old key; existing sessions should be revoked separately.
- Send it only over HTTPS. Do not put it in URL parameters.
- Chat History and personal Memory remain on-device in their existing storage; owner login does not migrate or clear them.
- Developer Agent D1 persistence routes are protected by the owner session and store only owner-scoped Developer Agent tasks, projects, and project notes. No D1 migration is applied remotely by CI.
- No production deployment, merge, or APK build is performed.
