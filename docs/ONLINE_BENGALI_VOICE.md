# Online Bengali voice transcription

The Android app can record a short Bengali voice message and send it to the Cloudflare Pages Function at `POST /api/assistant/voice`. The function forwards the audio to OpenAI's transcription API and returns the recognized text. The app does not contain the provider API key.

## Required setup

1. In Cloudflare Dashboard, open the Pages/Workers project serving this app and its **Settings → Variables and Secrets**.
2. Add `OPENAI_API_KEY` as an encrypted **secret** (not a client-side `EXPO_PUBLIC_*` variable).
3. Redeploy the Worker/Pages project after adding the secret.
4. Keep voice-processing consent enabled in the app. On Android, the Bengali mic records locally until the user taps the mic a second time; only then is the recording uploaded for transcription.

## Privacy and limits

- Audio is transmitted to the transcription provider only after the user starts and stops recording, with voice-processing consent enabled.
- Audio is not intentionally stored by this endpoint; it is forwarded for transcription and the transcript is returned to the app.
- Do not put the API key in app config, source code, APK assets, or a public environment variable.
- The provider may charge for transcription. Check the provider's current pricing and account limits before enabling this feature.
- The endpoint limits the base64 audio payload to about 10 MB and accepts Bengali or English language hints.
- The APK needs internet access. A missing secret returns `VOICE_API_NOT_CONFIGURED`; rate limits and transcription errors return safe user-facing errors.

## Endpoint contract

`POST /api/assistant/voice`

```json
{
  "audioBase64": "<base64-encoded short audio recording>",
  "mimeType": "audio/m4a",
  "language": "bn"
}
```

Successful response: `{ "text": "recognized words", "language": "bn" }`.
