# Badboy Developer Agent — Cloudflare-first, multi-engine architecture

## Goal

Add a Developer Agent to Badboy without replacing or regressing the existing assistant. The Developer Agent will expose three selectable engine modes:

1. **Badboy Native** — the first-party engine using the existing Cloudflare Worker orchestration and configured AI providers (OpenRouter/Groq and supported fallbacks).
2. **GitHub Copilot SDK** — an optional coding-agent engine using the official Copilot SDK, subject to supported runtime and authentication validation.
3. **Auto / Hybrid** — select an available engine by task capability and health; fall back to another configured engine after a recoverable failure, while preserving task context and showing the engine switch to the user.

The user can manually switch engines and retry a task with another engine. Engine selection is scoped to Developer Agent tasks only; it must not silently change the existing Chat or Voice model routing.

Keep the public API and orchestration on the existing Cloudflare platform. Do not introduce a separate paid always-on host.

## Non-negotiable preservation baseline (through PR #59)

All features and behavior delivered through PR #59 must remain intact. This includes, but is not limited to:

- Existing Chat, chat history, streaming, composer, keyboard behavior, and message actions.
- Voice input/dictation, Whisper Large-V3 transcription, Groq/OpenRouter fallback, voice output/TTS, Auto Speak, language selection, and voice consent/permissions.
- Hey Badboy wake-word model assets and current wake-word service/bridge, wake-word settings, and existing voice handoff behavior.
- Hands-free voice conversation start/stop and automatic listen/respond cycle.
- Memory, stored user preferences, Project Brain/context, and existing privacy controls.
- Settings / Control Center, Developer Mode, Expert Handoff & Code Review, Telegram-related functionality, integrations, provider settings, UI theme, navigation, and all other existing functions.
- Existing Cloudflare API routes, provider fallback order, environment bindings, workflows, and deployment protections.
- Existing files, model assets, dependencies, permissions, and user data.

Do not rebuild from scratch, remove, rename, replace, or refactor unrelated files. Before implementation, inspect the current main branch and PR #59 merge history, establish a baseline, and identify exact files required. Add regression tests around affected boundaries. If a proposed change risks an existing feature, stop and report the conflict instead of weakening that feature.

## Existing architecture

- Mobile client: `artifacts/mobile` (Expo / React Native).
- API runtime: `functions/api/[[path]].ts`, deployed on Cloudflare.
- Existing chat/model routing: configured OpenRouter provider/fallback chain.
- Existing transcription: Groq Whisper Large-V3 with OpenRouter fallback.
- Existing TTS, wake-word and memory flows must be reused, not replaced.
- Root workspace uses pnpm 10.8.1 and a 1440-minute minimum package release age. Preserve both.

## Cloudflare-first runtime boundary

Cloudflare Worker remains the public API gateway, authentication boundary, task orchestrator, event streamer, and engine selector. It can call model/GitHub APIs over HTTPS and use Cloudflare storage only when justified.

Do not spawn Copilot CLI child processes or run arbitrary shell commands inside a Worker request. The Copilot SDK's default runtime supervises a Copilot CLI process; therefore direct execution inside the current Worker is not assumed to be supported.

For SDK feasibility and approved repository commands, use a short-lived, isolated GitHub Actions runner with a narrowly scoped workflow. Validate the SDK's current supported authentication, licensing/subscription or BYOK requirements, CLI lifecycle, and Actions-runner compatibility before claiming it works. Do not add a separate paid persistent server.

## Engine selector behavior

### Badboy Native
- Works independently of Copilot.
- Uses the existing Cloudflare Worker and configured AI providers/fallbacks.
- Must not alter the normal chat/voice provider configuration.

### GitHub Copilot SDK
- Runs only through a validated supported runtime (initial feasibility target: ephemeral GitHub Actions runner).
- Copilot authentication/entitlement must be explicit and securely configured; never assume a subscription or expose credentials to the mobile app or model.
- If unavailable, report why and offer Native or Auto mode; do not silently pretend Copilot handled the task.

### Auto / Hybrid
- Select an eligible healthy engine based on task type and configured availability.
- On recoverable failure, offer or perform policy-approved fallback to another enabled engine.
- Preserve task ID, user instructions, relevant conversation/task context, and completed work when switching.
- Never repeat non-idempotent repository writes automatically. Require renewed approval before any write/command/PR action.
- Show selected engine, fallback reason, attempt history, and final result.

### Manual switch and retry
- User can switch engine for a task and retry without losing its plan/context.
- Engine choice applies only to Developer Agent.
- Clearly distinguish engine failure, provider quota/authentication failure, runner failure, and task/code failure.

## Proposed request flow

```text
Badboy Developer Agent UI
          |
          v
Cloudflare Worker (auth, engine selector, orchestration, streaming)
          |
          +--> Badboy Native: existing AI providers
          |
          +--> Copilot SDK: validated isolated Actions runner
          |
          +--> GitHub REST API: approved repository read/write
          |
          v
Plan + diff + test report + explicit approval
          |
          v
Dedicated branch / Draft PR
```

## GitHub authorization and safety

Use a GitHub App or OAuth flow with least-privilege, preferably repository-scoped permissions:
- Metadata: read.
- Contents: read by default; write only after explicit approval.
- Pull requests: read by default; write only after explicit approval.
- Actions: dispatch only the allowlisted workflow when authorized.

Never ask the user to paste tokens into chat. Keep credentials server-side, encrypted, short-lived where possible, and out of mobile payloads, model prompts, logs, diffs, artifacts, and PR text.

Read-only inspection is the default. File edits, commands, branch creation, PR creation, merge, production deployment, release publication, and APK builds each require their own explicit approval. No production secrets in test runners. Use ephemeral runners, job permissions, timeouts, output limits, and secret redaction.

## Delivery stages

1. **Current PR — guardrails and architecture:** GitHub Copilot instructions, Badboy Maintainer agent, Codespaces, Dependabot, three engine modes, and the preservation contract.
2. **Cloudflare API foundation:** authenticated agent sessions, engine/provider interface, task state, streaming, audit events, tests; Native engine first.
3. **GitHub connection:** repository-scoped authorization and read-only inspection, then approved branch/PR operations.
4. **Isolated runner:** allowlisted GitHub Actions workflow for approved tests/commands.
5. **Copilot SDK feasibility:** prove SDK runtime/authentication works in the isolated runner; implement Copilot adapter only after proof.
6. **Mobile UI:** engine selector (Native / Copilot SDK / Auto-Hybrid), task plan, permission prompts, switch/retry, diff and test review.
7. **Preview and regression validation:** compare behavior against the PR #59 baseline and verify all existing functions before any merge.

## Acceptance criteria

- All PR #59 and earlier functionality remains intact; no existing files/features are removed or replaced.
- Developer Agent exposes all three modes: Badboy Native, GitHub Copilot SDK, and Auto/Hybrid.
- User can manually switch engines and retry a task with context retained.
- Automatic fallback is transparent and does not repeat non-idempotent writes.
- Native engine works without Copilot.
- Normal Chat, Voice, Wake Word, Memory, settings, and provider routing are unaffected by Developer Agent engine selection.
- Cloudflare remains the API/orchestration host; no new paid persistent host.
- Copilot SDK runtime and authentication are proven before being described as operational.
- No arbitrary shell execution inside a Worker.
- Repository writes and commands are approval-gated and auditable.
- Regression tests cover affected existing behavior; Preview is tested before merge.
- No merge, production deploy, release, or APK build without separate explicit approval.

## References

- GitHub Copilot SDK: https://github.com/github/copilot-sdk
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- GitHub Actions workflow dispatch: https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
