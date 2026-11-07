# Badboy Developer Agent — Cloudflare API foundation

This phase moves the existing read-only Analysis Copilot request behind a dedicated Cloudflare API contract. It does not yet connect to GitHub or execute repository operations.

## Endpoints

### `GET /api/developer/health`

Returns availability for the Developer Agent engines and capabilities.

- Badboy Native is available when `OPENROUTER_API_KEY` is configured.
- GitHub Copilot SDK remains unavailable until its isolated CLI runtime and authentication are validated.
- Auto currently selects Badboy Native when the Native provider is configured.
- Repository read/write and workflow dispatch are explicitly reported as unavailable.

### `POST /api/developer/analyze`

Accepts JSON:

```json
{
  "prompt": "Plan a safe repository inspector",
  "projectContext": "Optional user-provided project summary",
  "requestedEngine": "native"
}
```

Limits:
- Request body: 16 KiB.
- Prompt: 1–4,000 characters.
- Project context: at most 8,000 characters.
- Engine: `native`, `copilot`, or `auto`.

The response is Server-Sent Events (SSE). Events include a server-generated task correlation ID, selected engine, status, and streamed text chunks. The mobile Developer Mode displays the task ID and preserves the existing streamed analysis experience.

## D1 persistence foundation

The Worker config declares the `AGENT_DB` binding for the existing `badboy-agent-db` database. The checked-in migration `migrations/0001_agent_persistence.sql` creates additive tables for:

- Developer Agent tasks and append-only task events.
- Owner-scoped projects and project memory, including privacy classification and deletion timestamps.
- Minimal audit records for important actions.

The storage adapter in `functions/api/agentStorage.ts` uses prepared statements, owner-scoped reads/deletes, and owner-checked `INSERT … SELECT` for task events and project memory. Task event payloads and summaries have explicit size limits.

**Important security boundary:** the adapter's `ownerId` argument must be derived from a server-verified identity, such as a validated Cloudflare Access JWT. It must never be trusted from a request body, query parameter, or unverified header. The adapter is not yet wired to a public API route. D1 persistence endpoints must remain disabled until Cloudflare Access identity verification, allowed-email policy, and mobile sign-in/token handling are implemented and tested.

The migration is committed but is not applied to the remote database by this PR. Use a local D1 migration test first; apply remotely only after explicit approval.

## Safety boundaries

- Analysis only: no GitHub repository reads, file writes, branch creation, workflow dispatch, shell execution, or PR creation.
- Copilot requests return `409 COPILOT_RUNTIME_UNAVAILABLE`; the server does not silently execute them with Native.
- Auto fallback to Native is explicit in the task metadata and health response.
- Audit logs must not contain prompts, project context, provider bodies, or credentials.
- Existing Chat, Voice, Wake Word, Memory, transcription, TTS, provider fallback, and normal chat routing are unchanged.
- No public route currently reads or writes the new D1 tables.

## Next phase

Implement and validate Cloudflare Access JWT verification (issuer, audience, signature and expiry), an allowlist for the user's approved email addresses, and a mobile-compatible authentication handoff. Bind the owner key only from that verified identity. Add authenticated task-history and project-memory routes after the auth boundary is proven. GitHub integration must use a secure GitHub App or OAuth authorization flow, server-side credential handling, repository-scoped permissions, and read-only access by default. Approved writes and workflow dispatch must remain separately permission-gated. Do not send a PAT or GitHub App private key to the mobile app or to an AI prompt.
