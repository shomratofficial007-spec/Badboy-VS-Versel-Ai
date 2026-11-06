# Badboy repository instructions

## Non-negotiable preservation contract
- Preserve every feature, file, API contract, user-data path, permission, and behavior delivered through PR #59 and earlier.
- This explicitly includes Chat, voice input/output, Whisper transcription and fallbacks, TTS, Hey Badboy wake-word assets/service/bridge, hands-free voice conversation, Memory, Project Brain, Settings/Control Center, Developer Mode, Expert Handoff & Code Review, Telegram-related functionality, integrations, UI/theme/navigation, provider routing, Cloudflare APIs, and deployment workflows.
- Never rebuild from scratch or remove, rename, replace, or refactor unrelated code. Do not modify existing features merely to make a new feature easier.
- If a requested change conflicts with an existing feature, stop and explain the conflict before editing.

## Project boundaries
- This repository is the Badboy AI mobile app and Cloudflare Worker/API. Keep the existing architecture and app identity.
- Developer Agent engine selection is isolated to Developer Agent tasks. Its Native / GitHub Copilot SDK / Auto-Hybrid modes must not silently change normal Chat or Voice model routing.
- Keep Cloudflare as the API/orchestration host unless the user explicitly changes this decision. Do not add a separate paid persistent host.

## Required workflow
- Inspect current main, relevant PR #59 history, source files, architecture, and tests before edits.
- Establish regression-test baseline for affected existing functionality.
- Make the smallest focused change on a dedicated branch; never commit directly to main.
- Use the repository's pnpm workspace, pinned pnpm 10.8.1, Node.js 22, lockfile, overrides, and 1440-minute minimum package release age.
- Add regression tests for every changed behavior; run focused tests/typechecks and broader checks when practical.
- Report exact files changed, tests actually executed, results, and remaining uncertainty.

## Agent engine rules
- Provide three Developer Agent modes: Badboy Native, GitHub Copilot SDK, and Auto/Hybrid.
- Native must work independently of Copilot.
- Copilot SDK must not be claimed operational until its supported runtime and authentication are proven; do not attempt to spawn Copilot CLI inside a Cloudflare Worker.
- Auto/Hybrid fallback must be transparent, retain task context, and never repeat non-idempotent writes without renewed approval.
- Engine selection must not affect Chat, Voice, Wake Word, Memory, or other existing features.

## Security and delivery
- Never expose, print, commit, or copy secrets, API tokens, signing keys, or user data into logs, source files, issues, or PRs.
- Require explicit approval for file writes, commands, branch creation, PR creation, merge, production deploy, release, and APK build.
- Use least-privilege GitHub permissions and isolated ephemeral Actions runners; never provide production secrets to test jobs.
- Prefer draft PRs for human review. Do not merge or deploy without explicit approval.
- Do not claim tests, runtime behavior, or deployments succeeded unless verified.

## Dependency and supply-chain rules
- Preserve workspace configuration, lockfile integrity, overrides, and minimumReleaseAge: 1440.
- Do not weaken dependency security controls; avoid unnecessary dependencies.
