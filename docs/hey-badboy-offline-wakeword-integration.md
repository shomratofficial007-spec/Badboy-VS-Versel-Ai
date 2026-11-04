# Hey Badboy offline wake-word integration

## What this change provides

- A typed mobile-side bridge for an optional Android native module named
  `BadboyWakeWord`.
- Safe capability/status handling when running on web, Expo Go, iOS, or an
  Android binary that does not include the native module.
- Start, stop, status, and local detection-event APIs.
- Threshold validation and an explicit unsupported error rather than a false
  success state.

## Model requirements

PR #47 added the trained assets under `models/hey-badboy/`. The model expects
16 kHz audio transformed to 40-bin log-mel features with a 25 ms Hann window,
512-point FFT, 160-sample hop, and per-bin CMN. Filtering and the exact
preprocessing chain in the model README are mandatory. The model emits a logit;
apply sigmoid before comparing with the 0.696 threshold. Use consecutive-frame
debounce and the configured refractory interval.

## Native Android module contract

The native module must register `NativeModules.BadboyWakeWord` and implement
`isSupported()`, `getStatus()`, `start({ threshold? })`, `stop()`, and
the `onWakeWordDetected` event. It must bundle/load the TFLite model, capture
audio locally, run preprocessing and inference on-device, and use an Android
microphone foreground service with a persistent notification and explicit
user opt-in. It must stop cleanly on permission revocation and service failure.

## Important validation status

This bridge is an integration boundary, not a completed always-on detector.
The Kotlin foreground service, TFLite interpreter/preprocessor, Expo config
plugin, and assistant voice-capture handoff are still required. No audio is
uploaded by this bridge. Do not expose an enabled toggle or claim offline
detection works until those native pieces pass build and physical-device tests.

## Required follow-up tests

1. Compare Kotlin preprocessing tensors against the reference implementation.
2. Test positive and negative recordings and tune threshold on a held-out set.
3. Measure false-trigger rate, missed detections, inference latency, and battery.
4. Verify Android 13+ notification permission and Android microphone
   foreground-service restrictions.
5. Verify wake event hands off to the existing Bangla/English voice flow without
   breaking dictation, Whisper, TTS, chat, or memory.
