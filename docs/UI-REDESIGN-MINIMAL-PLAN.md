# Badboy AI — Minimal ChatGPT-Inspired UI Redesign

## Product direction

Redesign the existing Badboy AI mobile interface toward a clean, minimal, ChatGPT-inspired experience. This is a visual and interaction redesign of the existing Expo + React Native application, not a rewrite and not a backend migration.

- Mobile-first, Android-first, responsive React Native layouts.
- Calm neutral surfaces in light and dark themes; restrained Badboy brand accents.
- Clear typography, predictable spacing, accessible touch targets, subtle borders and restrained elevation.
- Familiar conversational hierarchy: compact top bar, readable conversation, unobtrusive composer, contextual message actions.
- Avoid excessive neon, glow, gradients, decorative cards, and crowded navigation.
- Preserve Badboy AI identity and branding; do not clone proprietary assets or copy exact proprietary screens.

## Non-negotiable preservation requirements

Preserve existing functionality, data paths, permissions, API contracts, and navigation behavior, including:

- Owner authentication and route guards.
- Chat history, message state, streaming, regenerate, share, and error handling.
- Voice input/output, dictation/transcription, wake-word and hands-free flows.
- Memory and Project Brain.
- Skills, Plugins, workflows, Developer Mode, Expert Review / Handoff, GitHub integrations, Telegram-related functionality, and device integrations.
- Provider and model selection, provider management, secure key storage, and existing API orchestration.
- Cloudflare Worker remains the application backend; no deployment topology change is part of this UI task.
- Android APK/build configuration and existing CI workflows.

No feature may be silently removed, disabled, hidden without an equivalent discoverable entry point, or represented by a non-functional control.

## Current implementation observations

- The mobile application is Expo Router + React Native under `artifacts/mobile`.
- The primary chat screen is `artifacts/mobile/app/(tabs)/index.tsx`.
- Tab/navigation composition is in `artifacts/mobile/app/(tabs)/_layout.tsx`.
- Root authentication/session gating is in `artifacts/mobile/app/_layout.tsx`.
- Theme colors are consumed through `useColors`; redesign should use the existing theme system rather than hard-coded one-off palettes.
- The chat screen already contains voice, wake-word, streaming, message actions, tools, drawer/modal flows, and other integrations. These behaviors must be characterized before changing layout.
- Existing open PR #113 also touches chat UI/provider selection. Its work must be inspected and preserved; this PR must not overwrite or duplicate its provider/backend changes. Resolve integration/rebase sequencing before conflicting edits.

## Target information architecture

1. **Chat**
   - Minimal header with brand, conversation actions, and discoverable navigation.
   - Conversation area with clear user/assistant distinction and readable long-form content.
   - Composer anchored above keyboard/safe area; attach/tool/voice/send controls remain accessible.
   - Message actions remain available contextually without cluttering every message.
   - Empty state offers concise suggested prompts without overwhelming the screen.

2. **Navigation**
   - Keep existing routes for Chat, Memory, Workflows, Skills, Plugins, and Settings.
   - Use a compact, accessible navigation pattern appropriate to narrow Android screens.
   - Preserve route names and deep links.

3. **Provider/model controls**
   - Keep provider/model selection and connection status accessible from chat.
   - Do not change provider routing semantics or credentials storage as part of visual work.

4. **Settings and advanced capabilities**
   - Preserve all current settings and advanced screens.
   - Apply shared visual tokens and reusable components incrementally; avoid broad rewrites of complex settings logic.

## Design system

- Define/reuse semantic tokens for background, surface, elevated surface, foreground, muted text, border, primary, destructive, and focus states in both light and dark themes.
- Use a consistent spacing scale, typography hierarchy, radii, icon sizes, and minimum touch target dimensions.
- Ensure readable contrast, screen-reader labels, selected/disabled states, and keyboard-safe composer behavior.
- Prefer existing dependencies and components; no new dependency unless a verified requirement cannot be met otherwise.

## Implementation sequence

### Phase 0 — Baseline and integration audit
- Read repository instructions and inspect the current branch/working tree and open PR #113.
- Inventory the existing chat UI states, navigation routes, theme tokens, and interactive controls.
- Identify current tests and establish a baseline for mobile typecheck/tests/build.
- Record any overlap with PR #113 before touching shared files.

### Phase 1 — Shared visual foundation
- Establish minimal light/dark semantic tokens using the current theme architecture.
- Add or refine small reusable primitives only where they reduce duplication.
- Add focused tests for theme/token behavior where test seams exist.

### Phase 2 — Chat screen redesign
- Restructure presentation only, preserving existing handlers, state, API calls, and side effects.
- Improve header, conversation spacing, message presentation, empty state, composer, and contextual actions.
- Preserve streaming updates, keyboard behavior, safe-area handling, voice recording, wake-word lifecycle, attachments/tools, and accessibility.

### Phase 3 — Navigation and secondary screens
- Refine tab/navigation presentation without changing route names or auth guards.
- Apply shared visual language to Memory, Workflows, Skills, Plugins, and Settings in scoped slices.
- Preserve every setting and advanced control.

### Phase 4 — Verification and integration
- Run focused mobile tests and typecheck after each slice.
- Run repository lint/typecheck/build and relevant CI workflows where feasible.
- Validate light/dark mode, small-screen layout, keyboard/composer, streaming, voice, auth redirects, and all existing navigation paths.
- Review PR #113 integration and resolve conflicts without discarding either change set.
- Do not merge, deploy, or build/release an APK without separate explicit approval.

## Acceptance criteria

- [ ] Visual direction is minimal and ChatGPT-inspired while retaining Badboy identity.
- [ ] Both light and dark themes are readable and consistent.
- [ ] Existing feature inventory remains available and functional.
- [ ] Existing API contracts, Cloudflare backend, auth/session, secure storage, and user data paths are unchanged.
- [ ] Chat streaming, voice, wake-word, composer, message actions, and keyboard/safe-area behavior pass regression checks.
- [ ] Existing routes and deep links remain valid.
- [ ] Mobile typecheck, relevant tests, lint, and build results are recorded accurately.
- [ ] Android device validation is performed where a device/runtime is available; otherwise clearly marked unverified.

## Scope exclusions

- No backend/provider routing redesign.
- No OmniRoute/Termux/VPS deployment in this UI PR.
- No API key rotation or secret changes.
- No data migration, destructive cleanup, feature removal, merge, production deploy, or APK release.
