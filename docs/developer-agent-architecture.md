# Badboy Developer Agent — Cloudflare-first architecture

## Goal

Add two complementary coding-agent capabilities to Badboy without replacing the existing assistant:

1. **Badboy Developer Agent** — first-party agent using the existing AI-provider strategy (OpenRouter and configured providers) for project-aware planning, code review, and controlled GitHub changes.
2. **GitHub Copilot** — optional integration path. Repository Copilot instructions and the Badboy Maintainer custom agent remain available in supported GitHub/IDE clients. In-app Copilot SDK execution is deferred until a supported runtime/authentication path is validated.

The initial implementation must stay on the existing Cloudflare platform. Do not introduce a separate paid Node.js host.

## Existing architecture inspected

- Mobile client: `artifacts/mobile` (Expo / React Native).
- Current API runtime: `functions/api/[[path]].ts`, deployed as a Cloudflare Worker/Pages Function.
- Existing chat and model routing: OpenRouter free-model fallback chain.
- Existing voice transcription: Groq Whisper Large-V3 with OpenRouter fallback.
- Existing Developer Mode is currently a prompt-level capability in `systemInstruction()`; it is not yet a repository-editing agent.
- Root workspace uses pnpm 10.8.1 and a 1440-minute minimum package release age. Preserve both.

## Cloudflare-first runtime boundary

Keep the public API gateway and agent orchestration on Cloudflare Workers. The Worker can call model APIs and GitHub APIs over HTTPS, stream task events to the mobile app, and persist task metadata using Cloudflare storage products only when needed.

Do not try to spawn a Copilot CLI child process or run arbitrary shell commands inside a Worker request. Cloudflare Workers are not a general-purpose Node.js process host. The Copilot SDK's default runtime supervises a Copilot CLI process, so it is not directly embeddable in the current Worker handler.

For repository commands and tests, use a separate, short-lived GitHub Actions workflow runner triggered through GitHub's API, with tightly scoped permissions and no production secrets. This keeps the app/API hosted on Cloudflare and avoids adding another hosting provider. The workflow runner is not a persistent agent server.

## Proposed request flow

```text
Badboy mobile Developer Agent screen
          |
          v
Cloudflare Worker (auth, orchestration, streaming)
          |
          +--> Existing AI providers (Badboy planning/review)
          |
          +--> GitHub REST API (read repo, create branch/PR after approval)
          |
          +--> GitHub Actions workflow_dispatch (isolated tests/commands)
          |
          v
Diff + test report + explicit user approval
          |
          v
GitHub branch / draft PR
```

## Agent capabilities

### Badboy Developer Agent — first implementation
- Explain repository structure and relevant source files.
- Convert requests into a proposed plan and show affected files before editing.
- Review code and propose minimal patches.
- Use GitHub API to read files and create a branch/commit only after approval.
- Trigger an allowlisted GitHub Actions workflow for tests in an ephemeral runner.
- Stream progress and results back to the Badboy app.
- Work without a Copilot subscription.

### GitHub Copilot path
- Keep repository-wide Copilot instructions and the custom Badboy Maintainer agent for supported GitHub/IDE experiences.
- Do not represent this configuration as an in-app Copilot runtime.
- Revisit the official Copilot SDK for in-app use only after its supported hosting, CLI lifecycle, and authentication requirements are verified for a Cloudflare-triggered ephemeral GitHub Actions runner.
- Copilot remains optional; the first-party Badboy agent must work independently.

## GitHub authorization

Use a GitHub App or OAuth flow with least-privilege permissions. Prefer repository-scoped access. Request only the permissions required for the selected feature, such as:
- Contents: read; write only when the user approves a patch/branch.
- Pull requests: read; write only when the user approves PR creation.
- Actions: write only to dispatch the specific allowlisted workflow.
- Metadata: read.

Never ask users to paste tokens into chat. Store credentials only in encrypted server-side secrets. Never expose installation tokens or OAuth tokens to the mobile client, model prompt, logs, or PR content.

## Approval and safety model

- Repository analysis is read-only by default.
- File edits, command execution, branch creation, and PR creation each require explicit approval.
- Only allowlisted GitHub Actions workflows and commands may run; use ephemeral runners and least-privilege job permissions.
- Do not mount production credentials into test jobs.
- Never merge PRs, push to `main`, deploy production, publish releases, or build/distribute APKs without separate explicit approval.
- Show a diff and test output before asking to create a PR.
- Redact secrets and user data from logs; enforce task timeouts and output limits.

## Delivery stages

1. **Architecture and repository guardrails** — this document and the GitHub/Codespaces/Dependabot setup in this PR.
2. **Cloudflare API foundation** — authenticated agent-session endpoints, provider/engine interface, task status, streaming, audit events, and tests.
3. **GitHub connection** — OAuth/GitHub App authorization, repository picker, read-only inspection, branch and draft-PR actions behind approval.
4. **Isolated task runner** — a narrowly scoped GitHub Actions workflow dispatched by Cloudflare for approved tests/commands.
5. **Mobile UI** — Developer Agent screen, Badboy engine first, optional Copilot connection status, task plan, permission prompts, diff and test review.
6. **Copilot SDK feasibility** — validate whether a supported Copilot SDK CLI runtime can be safely launched by an ephemeral GitHub Actions job with the user's eligible Copilot authentication. Do not block the Badboy agent on this.
7. **Preview validation** — test with a non-production branch and repository; no automatic merge or production deployment.

## Acceptance criteria

- Existing chat, voice, wake-word, memory, and settings behavior remains unchanged.
- Badboy agent works independently of Copilot availability.
- Initial API/orchestration remains on Cloudflare; no separate paid host is added.
- No arbitrary shell execution occurs inside a Worker request.
- GitHub credentials never reach the mobile app or model.
- Repository writes and commands are approval-gated and auditable.
- All changes are covered by focused tests and reviewed in a draft PR.
- No production deploy, merge, or APK build is triggered as part of implementation.

## References

- GitHub Copilot SDK: https://github.com/github/copilot-sdk
- Cloudflare Workers documentation: https://developers.cloudflare.com/workers/
- GitHub Actions workflow dispatch: https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
