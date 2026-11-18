# Universal AI Provider Manager

## Goal

Allow the Badboy Android app owner to connect multiple AI API providers using keys entered in the app, select a provider/model per chat, and retain the existing server-side agentic and offline paths.

## Provider support strategy

Use two adapter classes:

- OpenAI-compatible chat-completions adapter for providers whose official API supports the OpenAI-compatible request/response contract.
- Native adapter for APIs with materially different authentication, request, streaming, or response formats (initially Google Gemini).

A provider is enabled only after its official API documentation and current account eligibility have been checked. A provider catalog entry must include its API mode, official base URL, model-discovery capability, free-tier classification, and a last-verified date. Do not infer that a model is free from its name.

Initial catalog candidates (availability varies by country/account and can change):
- Google AI Studio / Gemini API (free-tier eligible models)
- GroqCloud
- Cerebras (label trial credits separately from recurring free tier)
- SambaNova Cloud
- Mistral La Plateforme (free experimentation limits)
- OpenRouter (only explicitly free model IDs / free router)
- Cloudflare Workers AI (account quota / Neurons)
- Cohere (trial-key limits)
- NVIDIA API Catalog / NIM (account-specific eligibility)
- OmniRoute (user-hosted OpenAI-compatible endpoint, e.g. local Termux server)

Do not claim that this is every provider in existence. Keep the catalog extensible and allow a user-defined compatible endpoint.

## Android UX

Add a Provider Manager screen with:
- Add/edit/remove provider connection.
- Provider-specific API key input with masked display and explicit reveal toggle.
- Base URL field only for custom/self-hosted endpoints; built-in providers use vetted official URLs.
- Test Connection action that checks authentication and lists models when supported.
- Model picker with free, trial-credit, and paid labels.
- Per-chat active provider/model selection.
- Usage/error status and rate-limit feedback.
- Optional fallback chain, disabled by default and requiring explicit owner configuration.
- Clear warning before selecting paid models or enabling any billing-backed endpoint.

## Security requirements

- Store provider secrets only with Expo SecureStore on Android; never in AsyncStorage, app settings JSON, source code, logs, analytics, crash reports, or chat history.
- Never bundle provider keys in the APK or commit them to GitHub.
- Do not send provider keys to the Badboy backend by default. Make direct HTTPS requests from the app to the provider when the API contract allows it.
- For providers that require a server-side adapter, use a separate owner-controlled backend secret store; do not silently forward mobile keys.
- Require HTTPS for remote custom endpoints. Permit HTTP only for an explicitly confirmed loopback/local-network development endpoint, with a visible warning. Never allow arbitrary URL schemes.
- Validate endpoint host and request size; do not expose a generic server-side URL fetch proxy (SSRF risk).
- Redact secrets from all error messages and diagnostics.
- Fallback must never cross from free to paid unless the owner explicitly enables paid routing.

## Compatibility and workflow preservation

- Keep the current OpenRouter server integration working until the new path is tested.
- Keep offline AI, voice, memory, agentic tools, and existing owner-auth protections intact.
- Do not silently change the provider for an existing chat.
- Existing agentic chat remains on its current protected orchestration path until provider selection is explicitly supported there.
- Add unit tests for adapters, secure storage, model classification, fallback policy, malformed responses, rate limits, and secret redaction.

## Completion gates

1. Provider catalog and adapter tests pass.
2. Android typecheck and test suite pass.
3. Existing server, offline, voice, memory, and agentic tests remain green.
4. Manual device tests verify add-key, test-connection, model selection, chat, key removal, and app restart persistence.
5. Security review confirms no secrets in logs, AsyncStorage, APK assets, or repository.
6. Build APK only after the above gates pass.

## Free-tier truthfulness

Free quotas, eligible models, and terms change frequently. Store quota details as informational metadata with a last-verified date; do not hardcode a promise of unlimited or permanent free usage. Distinguish recurring free tier, promotional/trial credits, and paid models.
