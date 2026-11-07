# Badboy personal-owner authentication

This is a card-free, single-owner authentication foundation for a personal Badboy deployment. It uses Cloudflare Workers' built-in Web Crypto API and one Worker secret; it does not require Google Cloud, Cloudflare Zero Trust, Firebase, or a paid identity provider.

## Configure the Worker secret

1. Generate a high-entropy URL-safe key on a trusted local device:

   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

2. In Cloudflare Dashboard, open **Workers & Pages → badboy-vs-versel-ai → Settings → Variables and Secrets**.
3. Add a **Secret** named `BADBOY_OWNER_TOKEN` and paste the generated value directly into the Cloudflare secret field.
4. Do not paste the key into GitHub, source code, chat, screenshots, or logs.

The same key will later be entered into Badboy's sign-in screen and stored only with Android SecureStore. That mobile sign-in UI is intentionally a separate follow-up; this PR does not request or store the key in the app yet.

## Current API contract

- `POST /api/auth/verify` with `Authorization: Bearer <key>` returns `{ "authenticated": true }`.
- Missing Worker configuration returns 503 (fail closed).
- Missing or invalid credentials return 401.
- The verifier assigns the fixed server-side owner key `badboy-personal-owner-v1`; client-supplied owner IDs are ignored.
- The endpoint never returns the owner key or credential and never logs either.

## Security and rollout boundaries

- The key is a long-lived bearer credential. Anyone who obtains it can act as the personal owner until it is rotated. Keep it private and store it in Android SecureStore when mobile integration is added.
- Rotate/revoke it by replacing the Worker secret. Re-enter the new value on trusted devices after the mobile sign-in flow exists.
- Send it only over HTTPS. Do not put it in URL parameters.
- This PR only establishes and tests the verifier. Developer Agent D1 persistence routes remain 404/disabled; no D1 migration is applied remotely, no personal data route is enabled, and no production deployment or APK build is performed.
- Before D1 routes are enabled, a later change must require this verifier on every private route, pass only the returned server-owned `ownerId` into storage, and add route-level cross-owner/unauthenticated tests.
