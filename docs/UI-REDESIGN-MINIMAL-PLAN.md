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

4. **Settings — ChatGPT-inspired information architecture**
   - Reorganize Settings into a clean, searchable-feeling, compact list of clearly named categories and rows, following familiar ChatGPT Settings usability patterns without copying proprietary assets.
   - Use concise labels, short supporting descriptions, consistent icons, dividers, grouped controls, and compact typography. Avoid oversized hero/profile cards, decorative status badges, oversized headings, and clutter.
   - Organize existing controls into predictable groups such as Account & Security, Personalization, Appearance, Notifications, Voice, Data & Memory, AI Provider & Models, Connected Apps/Integrations, and Advanced.
   - Keep every existing setting and action discoverable; use drill-in subpages or compact expandable groups where appropriate rather than one extremely long mixed screen.
   - Preserve owner authentication, destructive-action confirmations, privacy disclosures, SecureStore behavior, and all existing setting persistence.
   - Provider/model setup pages introduced by PR #113 must remain accessible; do not duplicate or replace their provider-management implementation.

5. **Developer Mode — mobile control surface, not a status dashboard**
   - When enabled, Developer Mode must expose the existing supported developer capabilities in a mobile-first, task-oriented interface that can be operated from an Android phone.
   - Group capabilities into concise workflows (for example: project/repository, planning and agent tasks, code review/analysis, QA/testing, Project Brain/memory, integrations, and release/recovery controls where actually implemented).
   - Use compact forms, clear actions, confirmation gates for sensitive/destructive operations, and inline result/error feedback.
   - Do not create a separate status screen, status dashboard, telemetry page, or large always-visible status/log panel. Progress or execution feedback may appear inline only when needed to explain an active task or its result.
   - Do not imply unsupported capabilities are operational. A control may be shown only when it has a real handler and verified permission boundary; unavailable capabilities must be clearly marked unavailable or omitted until implemented.
   - Preserve existing GitHub authorization, preview/approval gates, agent execution safety, persisted task records, and private Project Brain data behavior. Task records remain stored; Settings must not render a permanent task-status/history dashboard. If history access is restored later, it must be explicitly opened from a task workflow, not presented as a status screen.

## Design system

- Define/reuse semantic tokens for background, surface, elevated surface, foreground, muted text, border, primary, destructive, and focus states in both light and dark themes.
- Use a consistent spacing scale, typography hierarchy, radii, icon sizes, and minimum touch target dimensions.
- Ensure readable contrast, screen-reader labels, selected/disabled states, and keyboard-safe composer behavior.
- Prefer existing dependencies and components; no new dependency unless a verified requirement cannot be met otherwise.

## Implementation sequence

### Phase 0 — Baseline and integration audit
- Read repository instructions and inspect the current branch and the now-closed PR #113 reference branch. PR #113 was closed at the user's request; its head branch and commits were preserved.
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
- Do not blindly integrate PR #113. Review its preserved head branch and selectively re-implement or cherry-pick only changes that pass the current requirements and independent verification; retain known gaps as open work.
- Do not merge, deploy, or build/release an APK without separate explicit approval.

## Acceptance criteria

- [ ] Visual direction is minimal and ChatGPT-inspired while retaining Badboy identity.
- [ ] Both light and dark themes are readable and consistent.
- [ ] Existing feature inventory remains available and functional.
- [ ] Existing API contracts, Cloudflare backend, auth/session, secure storage, and user data paths are unchanged.
- [ ] Chat streaming, voice, wake-word, composer, message actions, and keyboard/safe-area behavior pass regression checks.
- [ ] Existing routes and deep links remain valid.
- [ ] Settings uses compact ChatGPT-inspired category navigation, concise labels, and no oversized decorative/status content.
- [ ] Developer Mode exposes only real, supported mobile-operable actions; no separate status dashboard/screen is introduced.
- [ ] Sensitive developer actions retain explicit confirmation and permission boundaries.
- [ ] Mobile typecheck, relevant tests, lint, and build results are recorded accurately.
- [ ] Android device validation is performed where a device/runtime is available; otherwise clearly marked unverified.

## Scope exclusions

- No backend/provider routing redesign.
- No OmniRoute/Termux/VPS deployment in this UI PR.
- No API key rotation or secret changes.
- No data migration, destructive cleanup, feature removal, merge, production deploy, or APK release.

## Jarvis preservation — explicit user requirement

Jarvis is a protected, non-removable capability in this redesign. Keep its existing entry points, identity, settings, permissions, wake-word / hands-free behavior, floating-assistant controls, screen-awareness controls, and related lifecycle handling intact. Reorganize or restyle its controls only; do not rename Jarvis into a generic feature, remove it, hide it behind an undiscoverable path, or replace working behavior with placeholder controls. Any change touching Jarvis must include regression coverage for the affected permission and lifecycle paths.


## Current implementation notes (2026-11-22)

- PR #113 is closed and unmerged by explicit user instruction. Its `feat/universal-free-ai-provider-manager` branch remains intact as an unmerged reference; none of its 65 commits were deleted or merged.
- The first Settings implementation slice removes the oversized profile/status card, reduces typography and section density, and removes the always-visible Developer task-history, technical-log, and prior-development-history panels. Persisted task data and existing execution/approval handlers are not deleted.
- Jarvis remains in Settings with Start/Stop Bubble and Screen Awareness controls; existing Jarvis implementation and permission flows are unchanged.
- The Settings screen still needs broader category navigation and mobile-device validation. This first slice is not the complete redesign.
