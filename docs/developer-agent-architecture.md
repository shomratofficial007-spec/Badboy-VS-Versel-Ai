# Badboy Developer Agent + GitHub Copilot integration

## Goal

Add two complementary coding-agent capabilities to Badboy without replacing the existing assistant:

1. **Badboy Developer Agent** — the first-party Badboy agent, using the existing AI-provider strategy (OpenRouter and configured providers) for project-aware planning, code review, and controlled GitHub changes.
2. **GitHub Copilot Agent** — an optional engine powered by the official GitHub Copilot SDK, selectable from the same Developer Agent experience.

The app must clearly identify which engine is active. Copilot is optional; the Badboy agent must remain useful without a Copilot subscription.

## Existing architecture inspected

- Mobile client: `artifacts/mobile` (Expo / React Native).
- Current API runtime: `functions/api/[[path]].ts`, deployed as a Cloudflare Worker/Pages Function.
- Existing chat and model routing: OpenRouter free-model fallback chain.
- Existing voice transcription: Groq Whisper Large-V3 with OpenRouter fallback.
- Existing Developer Mode is currently a prompt-level capability in `systemInstruction()`; it is not yet a repository-editing agent.
- Root workspace uses pnpm 10.8.1 and a 1440-minute minimum package release age. Preserve both.

## Runtime boundary — important

The official Copilot SDK drives the Copilot agent runtime through JSON-RPC. Its default Node.js runtime is hosted by the Copilot CLI child process. A Cloudflare Worker request handler is not an appropriate place to spawn and supervise that long-lived process.

Therefore:
- Keep the existing Cloudflare Worker as the authenticated API gateway and streaming proxy.
- Run agent sessions in a separate Node.js service/runtime with isolated per-task workspaces.
- Do not bundle the Copilot SDK into the Expo Android app or the Cloudflare Worker.
- Select and validate the Node.js hosting/sandbox target before adding a deployable runtime. Do not silently introduce a paid hosting dependency.

## Proposed request flow

```text
Badboy mobile Developer Agent screen
          |
          v
Existing Cloudflare API gateway
          |
          v
Authenticated agent-session service (Node.js)
          |
          +--> Badboy Agent (existing configured model providers)
          |
          +--> Copilot SDK engine (optional)
          |
          v
Isolated repository workspace / task branch
          |
          v
Tests + diff summary + explicit approval
          |
          v
GitHub branch / draft PR
```

## Agent capabilities

### Badboy Developer Agent
- Explain repository structure and relevant source files.
- Convert requests into a proposed plan and show affected files before editing.
- Review code and propose minimal patches.
- Run allowlisted checks in an isolated workspace.
- Create a feature branch and draft PR after explicit approval.
- Stream progress and results back to the Badboy app.

### GitHub Copilot engine
- Use the official `@github/copilot-sdk` from a supported Node.js runtime.
- Support Copilot authentication when the user has eligible access, or supported BYOK configuration where applicable.
- Provide custom Badboy agent instructions and scoped tools.
- Treat it as an optional engine, not as an assumed free API key.

## GitHub authorization

Use a GitHub App or OAuth flow with least-privilege permissions. Prefer repository-scoped access. Request only the permissions required for the selected feature, such as:
- Contents: read; write only when the user approves a patch/branch.
- Pull requests: read; write only when the user approves PR creation.
- Metadata: read.

Never ask users to paste tokens into chat. Store credentials only in an encrypted server-side secret store. Never expose installation tokens or OAuth tokens to the mobile client, model prompt, logs, or PR content.

## Approval and safety model

- Repository analysis is read-only by default.
- File edits, command execution, branch creation, and PR creation each require an explicit approval step.
- Commands run only in a disposable, resource-limited workspace with a narrow allowlist; no production credentials are mounted.
- Never merge PRs, push to `main`, deploy production, publish releases, or build/distribute APKs without separate explicit approval.
- Show a diff and test output before asking to create a PR.
- Redact secrets and user data from logs; enforce task timeouts and output limits.

## Delivery stages

1. **Architecture and repository guardrails** — this document and the GitHub/Codespaces/Dependabot setup in this PR.
2. **Runtime decision** — select a Node.js host/sandbox that can run the Copilot CLI runtime and isolated Git workspaces. Confirm its cost/availability before implementation.
3. **Backend foundation** — authenticated session API, provider/engine interface, task isolation, streaming, audit events, and tests.
4. **GitHub connection** — OAuth/GitHub App authorization, repository picker, read-only inspection, branch and draft-PR actions behind approval.
5. **Mobile UI** — Developer Agent screen, engine selector (Badboy / Copilot), task plan, permission prompts, diff and test review.
6. **Preview validation** — test with a non-production branch and repository; no automatic merge or production deployment.

## Acceptance criteria

- Existing chat, voice, wake-word, memory, and settings behavior remains unchanged.
- Badboy engine works independently of Copilot availability.
- Copilot is an optional selectable engine and reports missing authentication clearly.
- No GitHub credentials are sent to the mobile app or model.
- Repository writes and commands are approval-gated and auditable.
- All changes are covered by focused tests and reviewed in a draft PR.
- No production deploy, merge, or APK build is triggered as part of implementation.

## References

- GitHub Copilot SDK: https://github.com/github/copilot-sdk
- Copilot SDK GA announcement: https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/
