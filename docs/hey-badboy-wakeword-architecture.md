# Hey Badboy wake-word integration architecture

## Status

Design-only proposal. This change intentionally does not alter application runtime, dependencies, Android permissions, model assets, Whisper transcription, or AI response behavior. Implementation must follow a separate reviewed change after the native integration points and model preprocessing have been validated.

## Compatibility facts verified

- Mobile workspace uses Expo SDK `~57.0.7`, React Native `0.86.3`, and `expo-audio ~57.0.5`.
- Current Expo app config requests `RECORD_AUDIO` and enables Expo Audio background recording. That is not itself a custom always-listening wake-word service.
- The exported TFLite model accepts Float32 `[1, 40, 101]` and returns a Float32 scalar logit. Apply sigmoid before comparing with the configured probability threshold.
- The supplied wake metadata says `window_frames: 100`, while the inspected model/README input is 101 frames. Do not silently reshape or trim; reconcile against the reference preprocessing before shipping.
- Existing speech transcript wake-phrase matching is not acoustic wake-word detection.

## Proposed runtime architecture

1. **User-controlled service start**
   - Add an explicit “Wake Word ON/OFF” control.
   - Start the microphone foreground service only while the app has a visible Activity and microphone permission is granted.
   - Show a persistent notification with a stop action and a clear microphone-use explanation.
2. **Kotlin native foreground service**
   - Own the microphone exclusively while wake-word mode is active.
   - Declare `android:foregroundServiceType="microphone"`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE` (where required), and `RECORD_AUDIO` through the Expo config plugin / generated manifest.
   - Use a bounded worker thread and deterministic cleanup on stop, service destruction, errors, and audio-focus/device interruptions.
3. **AudioRecord capture**
   - Capture mono PCM and validate the actual sample rate returned by the device. The model expects 16 kHz; if the device cannot provide it directly, use a tested resampler rather than relabeling the sample rate.
   - Use `getMinBufferSize` and a bounded ring buffer; keep the streaming filter state between chunks.
4. **Exact model preprocessing**
   - Preserve the exported reference pipeline and operation order: 100 Hz high-pass plus 50/60 Hz notch; peak normalization target -3 dBFS where applicable; 25 ms / 400-sample Hann window, 512 FFT, 160-sample hop; 40 log-mel bins; per-clip CMN.
   - Confirm centered-STFT frame count against the reference implementation. Model input is currently 101 frames.
   - Apply sigmoid to the scalar logit. Compare probability to `0.696`, require 2 consecutive qualifying frames, then enforce a 0.7 s refractory interval.
   - Apply the configured energy gate only after validating its units and behavior on real positive/negative clips.
5. **TFLite inference**
   - Start with CPU-only `Interpreter` and benchmark cold start, steady-state latency, CPU use, memory, battery, and false accept / false reject rates on target devices.
   - Treat NNAPI as an optional experiment after CPU correctness and parity pass. Do not claim NPU acceleration unless device-level measurements prove it.
   - Keep the FP32 TFLite model as the correctness baseline; evaluate INT8 only with measured detection accuracy.
6. **Safe microphone handoff**
   - On detection, stop reading, stop and release `AudioRecord`, close the interpreter/delegate if the service is transitioning, and confirm microphone ownership has been released before starting the existing Expo recording / Whisper upload flow.
   - Do not let Expo Audio and the wake-word service record concurrently.
   - After the current voice interaction finishes, resume wake-word capture only if the user left wake-word mode enabled and permission/service state remains valid.
7. **Existing assistant pipeline**
   - Reuse the current recorded-audio transcription and AI response functions. Do not replace or fork the existing Whisper, TTS, memory, chat, or API behavior.

## Android lifecycle and limitations

- Android 14+ checks while-in-use microphone permission when a microphone foreground service is created. Start it from a visible Activity after `RECORD_AUDIO` is granted; do not promise that it can be started from the background or at boot.
- A correctly started microphone foreground service can continue capture when the screen locks under normal OS conditions, but this is not a guarantee against Force Stop, user stopping the service, OEM battery management, permission revocation, microphone privacy toggles, or system resource restrictions.
- Provide explicit stop controls and truthful service state. Never hide microphone use.

## Required validation before runtime implementation

- Inspect the exact native project-generation path and existing voice module lifecycle before adding a config plugin or native module.
- Verify all ZIP assets and keep originals unchanged; package only the selected runtime model in the eventual Android asset location.
- Compare Kotlin preprocessing tensors against the Python reference on fixed WAV fixtures; assert shape `[1,40,101]` and numerical tolerances.
- Run positive and negative audio evaluation, threshold calibration, consecutive-frame/refractory tests, CPU benchmark, then optional NNAPI benchmark.
- Test permission denial/revocation, screen lock, app backgrounding, service stop, incoming call/audio interruptions, detection handoff, and return to listening.
- Run existing mobile typecheck/tests and regression-test Whisper transcription and AI replies.

## Non-goals for this proposal

- No merge, deployment, APK build, dependency installation, model conversion, or modification to existing runtime files.
- No promise of wake-word operation after Force Stop or across every OEM battery policy.
