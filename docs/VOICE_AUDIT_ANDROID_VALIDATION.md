# Voice audit: implementation and Android device validation

## What this change covers
- Preserves the existing English and Bangla wake phrase aliases: `Oi`, `ওহে`, `Badboy`, `ব্যাডবয়`, `JARVIS`, and `জারভিস`.
- Makes read-aloud availability report whether a real native/browser speech API is present instead of returning `true` when no engine is available.
- Adds regression tests for wake-phrase token boundaries and Bangla error guidance for permission denial, no speech, network failures, missing recognition service, and unsupported recognition.
- Does not delete existing features, dependencies, or files.

## Important platform boundary
Wake-word matching runs on recognized transcript text; it is not an always-on acoustic wake-word engine. The current `dictateOnce` session is finite and the existing code documents foreground-only behavior. Android audio background flags alone do not keep recognition alive after the app is backgrounded or the screen is locked.

Reliable lock-screen/background wake-word operation needs a purpose-built Android native foreground service with a visible ongoing notification, correct microphone foreground-service permissions/types, lifecycle/restart handling, battery-optimization considerations, and physical-device testing. This PR does **not** claim that feature is complete or that Android permits silent/hidden always-on listening. Keep listening user-initiated and permission-based.

## Required validation before APK sign-off
1. Run repository CI, mobile tests, typecheck, and Android APK workflow.
2. On a real Android device, test Bengali (`bn-BD`) and English (`en-US`) recognition with permission granted and denied.
3. Test no speech, network disconnected, recognition service missing/disabled, and unsupported device behavior.
4. Test Bangla read-aloud on the device's installed TTS engine; voice availability varies by device and installed language packs.
5. Record foreground, background, and locked-screen results separately. Do not mark background/lock-screen wake-word as passed unless verified with the native service implemented.
6. After the previous audit PRs are merged/deployed, verify Cloudflare health and a real AI chat response before interpreting APK results.

## Recorded-audio transcription

For repeatable Bengali/English recorded-audio test cases, Worker provider-routing boundaries, and evidence capture, follow the [recorded-audio transcription QA matrix](VOICE_TRANSCRIPTION_QA.md). This is separate from live dictation, wake-word, and TTS validation.
