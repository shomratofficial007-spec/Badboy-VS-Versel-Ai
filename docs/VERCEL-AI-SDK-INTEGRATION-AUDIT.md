# Vercel AI SDK Integration Audit & Feature Map

Status: package inventory completed; runtime integration and verification are still pending.

## Repositories
- Target app: https://github.com/shomratofficial007-spec/Voice-Memory-Assistant-net
- Source SDK fork: https://github.com/shomratofficial007-spec/Versel-ai-C

## Target application baseline inspected
- Root package manager: pnpm 10.8.1; TypeScript ~5.9.3; Wrangler ^4.152.0.
- Existing API handler: `functions/api/[[path]].ts`.
- Existing chat route: `POST /api/assistant/chat`.
- Existing health routes: `GET /api/health` and `GET /api/healthz`.
- Current chat implementation calls OpenRouter's OpenAI-compatible chat-completions endpoint directly and streams SSE chunks to the client.
- Current model is configured as `nvidia/nemotron-3.5-lightning:free`.
- Current worker health response checks whether `OPENROUTER_API_KEY` is configured.
- The target repository has a pnpm workspace with existing Replit integrations and an OpenAI server integration package. Do not replace its workspace or Android app.

## Source package inventory (84 directories)

### Core SDK and shared runtime
`ai`, `provider`, `provider-utils`, `gateway`, `open-responses`, `typesafe-ai`, `valibot`.

### Model provider adapters
`alibaba`, `amazon-bedrock`, `anthropic`, `anthropic-aws`, `assemblyai`, `azure`, `baseten`, `black-forest-labs`, `bytedance`, `cartesia`, `cerebras`, `cohere`, `deepgram`, `deepinfra`, `deepseek`, `elevenlabs`, `fal`, `fireworks`, `fish-audio`, `gladia`, `gmicloud`, `google`, `google-vertex`, `groq`, `heygen`, `huggingface`, `hume`, `klingai`, `luma`, `minimax`, `mistral`, `moonshotai`, `openai`, `openai-compatible`, `perplexity`, `prodia`, `quiverai`, `replicate`, `revai`, `togetherai`, `topaz`, `voyage`, `xai`, `zai`.

### UI and framework integrations
`angular`, `react`, `rsc`, `svelte`, `vue`.

### Agents, tools, workflow and external integrations
`mcp`, `langchain`, `llamaindex`, `workflow`, `workflow-harness`, `tool-bash`, `tool-web-fetch`, `sandbox-just-bash`, `sandbox-vercel`, `policy-opa`, `otel`.

### Developer tooling, harnesses and tests
`code-mode`, `codemod`, `devtools`, `harness`, `harness-acp`, `harness-claude-code`, `harness-cline`, `harness-codex`, `harness-cursor`, `harness-deepagents`, `harness-fx`, `harness-github-copilot`, `harness-grok-build`, `harness-opencode`, `harness-pi`, `test-server`, `tui`.

## Integration map for Badboy AI

| Capability | Source area | Proposed treatment | Compatibility/risk |
|---|---|---|---|
| Streaming text generation | `ai` + provider packages | First runtime integration candidate after dependency/lockfile check | Must confirm package versions, Worker compatibility, and current SSE client contract |
| OpenRouter / OpenAI-compatible model adapter | `openai-compatible` or OpenAI provider | Evaluate as a replacement for handwritten upstream request only after a parity test | Must retain current model, error codes, CORS, and stream format |
| Tool calling / agent loop | `ai`, `provider-utils` | Later phase; start with allowlisted, read-only tools | Tool execution requires server-side validation and explicit user confirmation for consequential actions |
| Structured output | `ai`, `provider-utils`, `valibot` | Optional later capability for typed intents/settings | Adds dependency and schema-validation surface |
| Model/provider choice | Provider packages | Add only providers that can be configured safely in Cloudflare secrets | Provider packages do not provide API credentials or free access |
| Speech, transcription, audio generation | `assemblyai`, `deepgram`, `elevenlabs`, `cartesia`, `openai`, others | Separate opt-in phase | Requires provider credentials, cost/rate-limit review, and Android permission/UX tests |
| Image/video generation | `fal`, `replicate`, `luma`, `klingai`, others | Optional separate phase | External service credentials, billing, response sizes, and latency |
| MCP | `mcp` | Later, only with explicit server allowlist and user consent | Untrusted tools/servers can expose data or perform actions |
| Web fetch / bash / sandbox | `tool-web-fetch`, `tool-bash`, sandbox packages | Do not enable directly in the mobile chat Worker in initial phase | SSRF, arbitrary command execution, isolation and abuse risks |
| UI framework adapters | `react`, `svelte`, `vue`, `angular`, `rsc` | Use only the adapter matching the existing frontend | Importing every framework is unnecessary and can bloat builds |
| Observability | `otel`, `devtools` | Evaluate only after data minimization and secret-redaction review | Avoid sending private prompts or tokens to logs |
| Harnesses, examples, tests, codemods | `harness*`, `test-server`, `codemod`, examples | Keep in development workflow, not production runtime | Not mobile app features |

## Compatibility findings and constraints
1. The source root is a Turborepo monorepo with pnpm 12.14 and TypeScript 6.0.3; the target uses pnpm 10.8.1 and TypeScript 5.9.3. Copying source root configuration would be unsafe.
2. The `ai` package currently declares Node >=22 and internal workspace dependencies. The published package and a provider adapter must be installed with compatible released versions; workspace:* references cannot be used as normal target dependencies.
3. The target is Cloudflare Workers/Pages-oriented. Any dependency must be checked for Worker Web API support, Node compatibility needs, bundle size, and streaming behavior.
4. The existing client expects the current SSE payload shape. Any adapter migration must preserve it or deliberately update and test both ends together.
5. API credentials must stay in Cloudflare secret bindings and must never be embedded in the Android app.
6. Never claim a provider, audio, agent, or tool feature works until a real integration test passes.

## Work sequence
1. Completed: initial target API/config inspection and inventory of all 84 source package directories.
2. Next: inspect the published package versions, lockfile, frontend chat stream parser, and CI/build workflow; select the smallest compatible first integration.
3. Add one isolated feature behind a feature branch, preserving existing endpoint contracts.
4. Run typecheck/build/tests and inspect GitHub Actions results.
5. Test Cloudflare health and chat API without exposing API keys; only then proceed to Android/APK checks.
6. Keep PR draft and do not merge/deploy until checks are green and the owner approves.

## What this report does and does not claim
This document records source inventory and compatibility analysis. It does not claim that Vercel AI SDK runtime features have already been integrated, that the Worker has been deployed, or that an APK has been built.
