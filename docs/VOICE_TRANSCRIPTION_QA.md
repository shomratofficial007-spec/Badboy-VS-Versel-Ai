# Recorded-audio transcription QA matrix

## Scope and limits

This guide validates the Android app's **recorded-audio transcription** path through the Cloudflare Worker. It is separate from live dictation, wake-word detection, and text-to-speech (TTS). A passing unit test or APK build does not prove real-device speech recognition quality.

The Worker route is `POST /api/assistant/transcribe`. It accepts `audioBase64`, a supported audio `format`, and an optional `language` tag.

## Verified provider and language behavior

- Language tags are normalized to ISO-639-1: `bn-BD` becomes `bn`, and `en-US` becomes `en`.
- When `GROQ_API_KEY` is configured, Groq Whisper Large-V3 is attempted first.
- If the Groq request fails, returns a non-success response, or returns no usable transcript, the Worker attempts OpenRouter Whisper (`openai/whisper-1`) when `OPENROUTER_API_KEY` is configured.
- An OpenRouter 429 is returned as `OPENROUTER_RATE_LIMIT`; other upstream failures are returned as a transcription error. The Worker does not currently route this transcription endpoint to Gemini.
- The separate HTTP 502-to-Gemini regression test in PR #139 exercises **chat streaming** at `/api/assistant/chat`; it is not evidence of Gemini audio-transcription fallback.

Provider credentials must remain in Cloudflare Worker secrets. Never paste API keys, owner tokens, or production credentials into test notes or issue comments.

## Device and build record

Before testing, record:

- Device model and Android version
- Installed APK version/build identifier and the APK artifact URL
- Worker version/deployment identifier used by the app
- Network type and approximate signal quality
- Test date/time and whether the microphone permission was granted
- Provider/model reported by the successful response, when present

Use a non-sensitive test account and synthetic speech. Do not record private conversations, personal identifiers, passwords, API keys, or confidential business data.

## Repeatable test matrix

Run the same clean-speech cases at least three times before introducing background noise. Use the recorded-audio path, not the browser's native live speech-recognition API.

| Case | Language tag | Test utterance | Expected behavior |
|---|---|---|---|
| BN-01 | `bn-BD` | “আজ বিকেলে আমাকে বাজারে যেতে হবে, তুমি কি সন্ধ্যা সাতটায় মনে করিয়ে দেবে?” | Bengali script; preserve the spoken words and sentence order |
| BN-02 | `bn-BD` | “আমি একটু পরে মিটিংয়ে যোগ দেব, এখনো রাস্তার মধ্যে আছি।” | Preserve colloquial wording; do not translate or summarize |
| BN-03 | `bn-BD` | “রাফি বারোটা ত্রিশ মিনিটে আসবে, তাকে দরজার কাছে অপেক্ষা করতে বলো।” | Preserve the synthetic name and spoken number wording |
| BN-04 | `bn-BD` | “আজকের order টা cancel করো না, শুধু status update দাও।” | Preserve clear English words in a Bengali-English mixed utterance |
| EN-01 | `en-US` | “Please remind me to call the support team at ten thirty tomorrow morning.” | English transcription; Bengali-specific prompt must not be attached |
| NOISE-01 | `bn-BD` | Repeat BN-01 with moderate background noise | Record exact substitutions, deletions, insertions, and whether meaning changed |
| SPEED-01 | `bn-BD` | Repeat BN-02 at normal and faster conversational speed | Record whether words are dropped, duplicated, or reordered |

The quoted utterances are QA inputs only; they must not be added as example phrases to the model prompt.

## Provider fallback and error checks

Run provider-failure scenarios only in local tests or a dedicated non-production test environment. Do not deliberately exhaust quotas or force upstream failures against production.

| Scenario | Expected observable result |
|---|---|
| Groq configured and successful | Response reports `provider: "groq"` and `model: "whisper-large-v3"` |
| Groq returns a retryable failure; OpenRouter configured and successful | Worker attempts OpenRouter Whisper and reports `provider: "openrouter"` |
| OpenRouter returns HTTP 429 | Worker returns HTTP 429 with `OPENROUTER_RATE_LIMIT` |
| OpenRouter returns another non-success response | Worker returns a transcription upstream error; no fabricated transcript |
| No usable provider is configured | Worker returns a configuration/upstream error; record the exact status and code |
| Client cancels the request | Worker does not start another provider attempt after cancellation |

For each run, capture the HTTP status, response `code` (if present), `provider`, `model`, and elapsed time. Never record authorization headers or secret values.

## Result capture

Use one row per attempt. Keep the reference phrase and transcript text free of personal data.

| Case / attempt | Provider / model | HTTP status | Latency | Transcript accurate? | Word changes / notes |
|---|---|---:|---:|---|---|
| Example: BN-01 / 1 |  |  |  |  |  |

For a quantitative comparison, optionally calculate word error rate (WER):

`WER = (substitutions + deletions + insertions) / reference words × 100`

Compare normalized words and report punctuation/capitalization separately. Do not invent a pass percentage: retain the exact transcript and have the owner review any meaning-changing substitutions.

## Sign-off criteria

- Bengali speech remains in Bengali script and is not translated or summarized.
- Spoken word order, question phrasing, repetitions, and clear Bengali-English code-switching are preserved.
- English input is not forced through the Bengali-specific prompt.
- Provider/model and error outcomes match the Worker response contract.
- No test reports a pass unless the exact APK and Worker versions were exercised on a physical device.
- CI results, emulator results, and physical-device results are recorded separately.
