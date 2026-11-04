# Badboy Wake Word: Safe Porcupine Integration Plan

## Status

**Phase 0 — architecture and safety plan only.** This document deliberately does not install Porcupine, change the Expo configuration, alter the existing recorder, or enable always-on listening.

Target repository: `shomratofficial007-spec/Badboy-VS-Versel-Ai`  
Current mobile stack observed on `main`: Expo SDK `~57.0.7`, React Native `0.86.3`, `expo-audio ~57.0.5`, `expo-speech-recognition ~57.1.0`.

## Current microphone owners

The current chat screen creates one `useAudioRecorder(RecordingPresets.HIGH_QUALITY)` instance. On Android/iOS voice input it:

1. requests recording permission;
2. sets `setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })`;
3. prepares the Expo recorder;
4. starts `audioRecorder.record({ forDuration: 20 })`;
5. stops the recorder, obtains its URI, sends it to `transcribeRecordedAudio()`, deletes the temporary file, and sets `allowsRecording: false`.

The app config already enables the `expo-audio` config plugin with both `enableBackgroundRecording: true` and `enableBackgroundPlayback: true`. This plugin is responsible for adding Expo Audio's Android recording/playback foreground-service declarations and associated permissions. Do not add duplicate service declarations or blindly append duplicate permissions.

## Verified Porcupine capture behavior

Picovoice's React Native quick start installs both:

- `@picovoice/porcupine-react-native`
- `@picovoice/react-native-voice-processor`

The high-level `PorcupineManager` starts and stops its own microphone capture through `start()` and `stop()`; `delete()` releases the manager resources. Custom keyword detection uses a Console-generated `.ppn` file. Picovoice also documents a low-level API where the application supplies audio frames to Porcupine.

**Conflict:** the high-level Porcupine manager and Expo Audio recorder must not be treated as two simultaneous microphone clients. The first implementation must serialize ownership. Do not run Porcupine Voice Processor and `expo-audio` recording at the same time.

## Required serialized lifecycle

Use a single app-level microphone coordinator with explicit states:

`idle → wake_listening → handoff_to_command → command_recording → transcribing → assistant_processing → speaking → wake_listening`

Rules:

1. Only one state may own microphone capture at a time.
2. On wake-word detection, stop Porcupine and await completion before enabling Expo Audio recording.
3. Start Expo Audio only after the Porcupine stop has completed successfully. If stop fails or the manager reports an error, do not start the recorder; surface a recoverable error.
4. On command recording completion, stop Expo Audio, release its recording session/mode, then transcribe the saved recording through the existing Groq Whisper / Cloudflare path.
5. Keep the existing AI request and TTS implementation unchanged in the first integration.
6. Resume Porcupine only after the assistant's speech playback has actually completed (the existing speech completion callback), all Expo Audio recording has stopped, and the audio session has been returned to a compatible non-recording state.
7. On screen blur/unmount, app shutdown, permission revocation, audio interruption, or any exception: stop the active capture owner and release resources. Never leave both engines running.
8. Debounce wake callbacks so one detected phrase cannot start multiple command recordings.
9. Keep manual push-to-talk functional and mutually exclusive with wake listening.
10. If a lifecycle transition fails, fail closed: microphone capture remains stopped until the user retries.

## Android background-service gate

The existing Expo Audio background-recording setting does not by itself prove that Porcupine's separate Voice Processor can keep listening in the background. Before enabling background wake listening, verify the exact installed Picovoice React Native package version's Android implementation and test its service behavior on a real Android device.

The implementation must not claim background/lock-screen wake support until all of these are verified:

- Android manifest permissions and foreground-service type declarations are correct and non-duplicated.
- The microphone foreground service is started while the app is eligible to start it; Android's background microphone restrictions are respected.
- A persistent user-visible notification and explicit stop control exist where required.
- App foreground/background transitions, screen lock, notification stop, permission revocation, process death, and OEM battery restrictions are handled.
- No unsupported promise is made for force-stop or OEM battery-kill scenarios.

Do not add a second microphone foreground service until it is established whether the Voice Processor can be integrated with the existing Expo Audio service or requires a separate, correctly coordinated service. Avoid two independent microphone services.

## Keyword and credential prerequisites

Before native integration:

- The owner must create a Picovoice Console account and provide/configure an AccessKey without committing it to Git.
- The owner must generate and supply the exact custom `Hey Badboy` keyword model (`.ppn`) for Android (and a separate platform asset if iOS support is later requested).
- Confirm the keyword model language/platform and license/account constraints.
- Do not put the AccessKey in source code, `app.json`, logs, PR descriptions, or committed environment files. Use a runtime secure configuration path and document that a client-side SDK key cannot be treated as a server secret.

## Staged implementation plan

### Phase 1 — dependency and native compatibility spike

- Pin compatible Picovoice React Native and Voice Processor package versions.
- Verify peer dependencies against Expo SDK 57 / React Native 0.86.3 / New Architecture settings.
- Add a minimal native development-build smoke test only after the owner supplies the AccessKey and `.ppn` asset.
- Do not modify the current recorder flow in this phase.

### Phase 2 — microphone ownership coordinator

- Implement a small, testable state machine / mutex for microphone ownership.
- Add unit tests for legal transitions, duplicate wake callbacks, stop failures, unmount cleanup, and manual-recording exclusion.
- Keep wake listening disabled by default until native validation passes.

### Phase 3 — native wake-word handoff

- Integrate Porcupine behind the coordinator.
- On detection: stop Porcupine → await release of capture → start existing Expo Audio command recorder.
- After transcription, AI response and completed TTS: stop/release Expo Audio session → restart Porcupine.
- Preserve the current Whisper, Cloudflare/OpenRouter, and TTS paths.

### Phase 4 — Android foreground and device validation

- Validate foreground-only wake detection first.
- Then separately validate screen lock/background behavior with a real Android device and the correct foreground-service implementation.
- Test mic permission denied/revoked, notification stop, audio focus/interruption, repeated wake events, network loss during transcription, TTS errors, and battery optimization.
- Only claim support for scenarios that pass repeatable device tests.

## Acceptance criteria

- Existing manual voice recording and Whisper transcription continue to work unchanged when wake mode is disabled.
- At no time are Porcupine and Expo Audio both capturing microphone input.
- Every start has a corresponding stop/release path, including error and unmount paths.
- One wake detection starts exactly one command recording.
- Porcupine resumes only after command processing and TTS completion.
- No credentials or private keyword assets are committed.
- Foreground and background support are reported separately and only after real-device tests.

## Files inspected on main

- `artifacts/mobile/package.json`
- `artifacts/mobile/app.json`
- `artifacts/mobile/app/(tabs)/index.tsx`
- `artifacts/mobile/lib/assistant/voice.ts`

No existing source files are changed by this phase-0 plan.
