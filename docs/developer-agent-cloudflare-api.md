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

## Safety boundaries

- Analysis only: no GitHub repository reads, file writes, branch creation, workflow dispatch, shell execution, or PR creation.
- Copilot requests return `409 COPILOT_RUNTIME_UNAVAILABLE`; the server does not silently execute them with Native.
- Auto fallback to Native is explicit in the task metadata and health response.
- Audit logs contain task IDs, engine, event, and sanitized failure categories only. They do not log prompts, project context, provider bodies, or credentials.
- Task IDs are correlation identifiers for a single request, not durable sessions. Persistent task history and event storage require a later storage-binding decision.
- Existing Chat, Voice, Wake Word, Memory, transcription, TTS, provider fallback, and normal chat routing are unchanged.

## Next phase

The GitHub connection phase must use a secure GitHub App or OAuth authorization flow, server-side credential handling, repository-scoped permissions, and read-only access by default. Approved writes and workflow dispatch must remain separately permission-gated. Do not send a PAT or GitHub App private key to the mobile app or to an AI prompt.
