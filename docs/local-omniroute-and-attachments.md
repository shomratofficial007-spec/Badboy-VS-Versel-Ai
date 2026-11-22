# Local OmniRoute and private attachments

## Local-first Agentic routing

Open Badboy AI **Settings → Provider Manager → Local OmniRoute** and configure:

- **Base URL:** for OmniRoute running in Termux on the same Android phone, use `http://127.0.0.1:<PORT>/v1`. Replace `<PORT>` with the port configured in OmniRoute; this repository does not assume a default port.
- **Model ID:** use the exact model ID exposed by the router's OpenAI-compatible `/models` endpoint.
- **Local API key:** optional; stored only in Android Secure Storage and sent directly to the local endpoint in the Authorization header.
- **Free API backup:** save an OpenRouter API key in Provider Manager and keep the backup model as `openrouter/free` or a model ID ending in `:free`. Paid model IDs are rejected for this route.

The local route sends Planner, Tool Calling, Executor, Reviewer, and Synthesizer requests directly from the phone to `/chat/completions`. Read-only integration tools are initiated by the on-device orchestrator through the existing owner-authenticated Worker adapters.

The Free OpenRouter backup is used only when the local route fails before a tool call has been attempted and before any final text is emitted. If a tool has already run or final text has started streaming, the workflow stops instead of replaying it on another provider. The chat UI displays the active route and the reason for a Free API fallback.

### Network constraints

- HTTP is accepted only for loopback or private LAN addresses; public endpoints must use HTTPS.
- Android cleartext traffic is enabled for the native app because a Termux service on the same phone normally uses loopback HTTP. The Local OmniRoute URL validator blocks public HTTP URLs, credentials, query strings, and fragments.
- If OmniRoute runs on another LAN device, use HTTPS where possible. The phone and server must be on the same reachable network.
- Keep the Termux OmniRoute process running while using Local OmniRoute. The app cannot keep a stopped Termux process alive.

## Attachment support

The chat picker accepts:

- Images: PNG, JPEG, WebP
- Text documents: TXT, Markdown, CSV, JSON

Limits are 1 MB per file, four files per message, 100 files per owner, and 25 MB total per owner. Images are sent as image data to a vision-capable model; text documents are decoded and added as untrusted context. PDF, DOCX, XLSX, SVG, and executable files are not accepted by this implementation.

Uploads use the existing owner-authenticated D1 binding. Objects are private, keyed by a generated UUID, and read or deleted only when the verified owner ID matches the stored owner ID. No public attachment URL is generated.

## Production migration

Migration `migrations/0003_agent_attachments.sql` creates the private attachment table and owner index. It is **not applied to production by this PR**. After review and merge, an authorized maintainer must run the repository's **Apply Production D1 Migrations** workflow with its explicit production confirmation before enabling production attachment uploads.

No production deployment, migration execution, or APK release is performed by this change.
