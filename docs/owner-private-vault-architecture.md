# Badboy Owner Private Vault & Native Capability Architecture

**Status:** Proposal / planning only  
**Implementation status:** Not implemented  
**Scope of this PR:** Documentation only. No application code, workflow, configuration, database, secret, permission, or deployment changes.

## 1. Purpose

Define a future owner-only development environment inside Badboy, separate from the normal Badboy experience. The goal is to let the Badboy Native AI improve its development capabilities through research, experiments, tool-building, testing, and verified reporting while keeping the owner in control of repository writes and production-impacting actions.

This document records the product and architecture decisions discussed with the owner. It is not authorization to implement them.

## 2. Two separate Badboy environments

Badboy will have two logically and technically separated environments:

### 2.1 Normal Badboy

- The ordinary assistant experience for normal and, if enabled later, public users.
- Existing Chat, Voice, settings, provider routing, memory, and other features remain intact.
- It must not be able to read the Private Vault's local memory, files, projects, or sandbox data.
- Normal-mode provider configuration must not be changed by Private-mode work.

### 2.2 Private Badboy

- An owner-only environment controlled by the Badboy Native AI Engine.
- Dedicated private chat, local memory, files, project history, Developer Lab, Sandbox Lab, and Research Lab.
- Separate authorization, storage, execution boundary, audit history, and UI state.
- Third-party/second-party AI providers do not receive Owner Override authority and cannot become the Private environment's controller.
- No public user or ordinary Normal Badboy request can access this environment.

The separation must be enforced by backend/service authorization and storage boundaries, not merely by hiding UI elements.

## 3. Secret Verified Access and private entry UI

The intended user experience is:

1. The owner enters a separately configured Owner Verified Access Code while already using the legitimate owner authentication/session flow.
2. The code is verified server-side (or by a secure local verifier for a strictly local unlock step); it is never committed to source code, logged, sent to an AI provider, or stored in plaintext.
3. After successful verification, the Badboy wordmark/header changes to a distinct Private Mode color/state.
4. Clicking the Badboy header opens the separate Private Workspace.
5. The workspace has its own navigation and can open separate tabs/workspaces for Private Chat, Private Memory, Developer Lab, Sandbox Lab, Research Lab, and Private Files.
6. The owner can create, edit, organize, and delete permitted workspace items from within the Private environment.
7. Logout, session expiry, lock, or explicit exit returns the UI to Normal Mode and locks private data.

The small/hidden “B” entry affordance discussed by the owner is a convenience/discovery detail only. A hidden button, color change, or secret URL is not an authentication or authorization boundary.

### Owner command / capability override

A separate Owner Secret Command may activate an elevated *task policy* for the authenticated owner. It must be usable only by the Badboy Native AI control plane.

When invoked, Native AI must not stop at a generic “cannot do that” response. It should:

- Reassess the task and distinguish missing knowledge from missing tools, permissions, credentials, runtime, hardware, or external dependencies.
- Research relevant documentation and possible implementation paths.
- Inspect its Capability Registry and discover suitable existing tools.
- If a tool is missing, prepare a safe implementation plan and, where authorized, build it in an isolated sandbox.
- Run relevant checks and provide evidence of what actually worked.
- If blocked, provide a specific blocker report listing the exact missing tool, permission, API access, runtime, or owner action needed, plus a practical implementation plan.

The command does **not** make technically impossible tasks possible, grant credentials, bypass authorization, override platform/provider terms, disable security controls, or authorize production changes. It requires a valid Owner Session in addition to the command. Store only a verifier/derived representation, apply rate limits and replay protections, and keep the literal command out of repository files and logs.

## 4. Native AI authority and provider isolation

- Badboy Native AI Engine remains the only primary controller for Private Badboy.
- Gemini, OpenRouter, 9Router, OmniRoute, Copilot, or any other external/third-party AI can never validate the Owner Secret, grant Owner authority, unlock the Vault, or independently authorize actions.
- If optional providers are used elsewhere in Badboy, they remain subordinate adapters; they do not gain repository write permissions or private-memory access.
- For the strict Private Vault path, private memory and private files must not be sent to remote AI providers. Use local/native processing for private content. If a requested task requires remote AI processing of private content, block it unless the owner explicitly changes the privacy policy for that specific operation.
- Owner Secret verification and session operations must not call an AI provider or consume AI-provider quota.

## 5. Device-only Private Memory and storage

The owner's preferred default is a device-only Private Vault, initially focused on the owner's Android phone.

### Data intended to remain on the device

- Private chat history and conversation attachments.
- Private long-term memory, notes, and project context.
- Private workspace files, local settings, and activity history.
- Sandbox projects, experiment artifacts, and local test results unless explicitly selected for publication to the separate Developer Repository.

### Required safeguards

- Encrypt private data at rest using keys protected by Android Keystore (or the platform's equivalent).
- Require device authentication (PIN/biometric) for Vault unlock, with a defined lock timeout.
- Exclude Vault data and encryption keys from OS/cloud backup and ordinary app analytics/crash payloads.
- No automatic cloud sync, remote database replication, telemetry upload, or third-party AI access to Vault data.
- Keep Normal Badboy storage and APIs unable to query Private Vault storage.
- Provide owner-controlled inspect/export/delete controls only if they preserve the device-only default. Any export must be an explicit, clearly explained owner action; no automatic export.
- Secure deletion should remove the relevant local database records and managed files, while documenting platform limitations for flash storage and backups.
- If the app is uninstalled, the local Vault may be lost. Recovery must not silently introduce cloud storage; an optional owner-controlled encrypted offline backup can be considered later as a separate decision.

### Offline behavior and hardware limits

Private Memory should remain readable and usable offline. Full offline AI reasoning requires a compatible local model and sufficient device RAM, storage, and compute. Local storage alone does not make a remote AI model offline. The UI must clearly identify any operation that cannot run without network access.

## 6. Separate Private Developer Repository

Create a separate GitHub repository with **Private** visibility for Native Developer Agent research, experiments, and code-skill development.

- It is distinct from the production Badboy application repository.
- Access should be limited to the Badboy Developer Agent's narrowly scoped GitHub App/installation identity and the owner as administrator. The AI model itself is not a GitHub identity; a trusted backend/runner obtains short-lived, least-privilege installation credentials.
- Prefer read access by default. Grant contents/PR write capability only to the isolated, allowlisted Developer Agent workflow.
- Use dedicated experiment branches. Do not give the agent direct write access to the protected default branch.
- The agent may inspect code, research approaches, create experimental branches, run approved tests/scans, and prepare a report/PR.
- A successful experiment is not automatically production-ready. It must include a diff, test evidence, security findings, dependencies, risks, and rollback plan.
- The owner must explicitly approve each merge. No owner approval means no merge.
- No production deployment, release, production migration, or APK publication is implied by a repository PR.
- Private Vault memory, personal chat, Owner Secret, access tokens, production secrets, and unrelated personal files must never be copied into this repository.

The separate GitHub repository is intentionally remote and therefore is an explicit exception for selected source-code/test artifacts. It does not change the device-only rule for Private Vault memory and personal data.

## 7. Research and AI testing intelligence

The Native Developer Agent may monitor public research and evaluation resources to discover new AI models, features, tools, benchmarks, and engineering practices. Candidate sources discussed include:

- Artificial Analysis — model capability, speed, and cost comparisons.
- Hugging Face — models, datasets, libraries, and evaluation material.
- LMSYS Chatbot Arena — human preference comparisons and model evaluations.
- Papers with Code — research papers, implementations, and benchmarks.

These are discovery sources, not automatic proof of quality or compatibility. The agent must check source credibility, publication/update date, licensing, model/provider terms, reproducibility, and whether results apply to Badboy's own use case.

Proposed research workflow:

1. Discover new research, releases, and evaluation results.
2. Summarize the source, date, limitations, and relevance.
3. Identify a candidate feature or tool and define a measurable hypothesis.
4. Prototype only in the isolated lab/repository branch.
5. Run reproducible tests, security checks, and performance comparisons.
6. Produce an evidence-backed report and proposed PR.
7. Wait for explicit owner approval before merging or promoting anything.

## 8. Capability discovery, tool building, and safe execution

The Private Native Developer Agent should have these planned capabilities:

- Capability Registry: inventory of available tools, permissions, runtimes, and supported actions.
- Tool Discovery: find suitable APIs, SDKs, packages, and documented integrations.
- Research Planner: turn a task into evidence-based implementation steps.
- Tool Builder: create adapters or tools in an isolated development branch/sandbox.
- Execution Sandbox: run allowlisted commands with resource limits, no production secrets, restricted network access, and disposable state where possible.
- Test and Verification Engine: distinguish unit/integration/security/performance results and retain evidence.
- Recovery: revert failed experimental changes and preserve the last known-good state.
- Blocker Report: state exactly what is missing and how it could be supplied.

No arbitrary command execution in the Cloudflare Worker request path. Any shell/build/test workload must use a validated isolated runtime (for example, an ephemeral, tightly scoped runner) after feasibility and security review.

## 9. Private Workspace information architecture

Proposed separate workspace sections:

| Area | Purpose |
| --- | --- |
| Private Chat | Owner's private conversations with Native Badboy |
| Private Memory | Encrypted device-only notes and long-term context |
| Developer Lab | Private repository, branches, diffs, and PR reports |
| Sandbox Lab | Isolated experiments and disposable test environments |
| Research Lab | Public AI research, model evaluations, and feature discovery |
| Private Files | Owner-managed local files and project artifacts |
| Activity & Audit | Local record of actions, approvals, tool runs, and outcomes |
| Workspace Settings | Lock, session, local storage, memory controls, and privacy settings |

The owner can create, edit, organize, and delete workspace content. Each section must respect the same Owner-only authorization and data-isolation rules.

## 10. Approval matrix

| Action | Agent behavior |
| --- | --- |
| Read public documentation/research | May do automatically within allowed network policy |
| Inspect its private development repository | Read-only by default |
| Create an experiment branch or draft PR | Only through the approved GitHub App workflow and scoped permissions |
| Run isolated tests/scans | May run within approved sandbox policy |
| Modify its experimental branch | May do within the isolated lab policy; record a diff |
| Merge a PR | Explicit owner approval required for each merge |
| Change production code/configuration | Separate explicit owner approval required |
| Production D1 migration or deployment | Never implied by Owner Secret or PR approval; requires separate explicit authorization |
| Publish release/APK or change production secrets | Separate explicit owner approval required |
| Access or export Private Vault memory | Owner-only, explicit, and local by default |
| Send Private Vault data to any remote provider/service | Blocked by default; requires a separate explicit privacy decision |

## 11. Relationship to the existing four-PR Developer Agent roadmap

Preserve the previously agreed four separate implementation PRs; do not combine, renumber, or silently expand them:

1. **PR-1 — Native AI Engine, Provider Adapter & Authorization.** Native remains primary; optional providers are subordinate adapters; secure owner/session authorization.
2. **PR-2 — Repository Reader & Code Editing.** Repository understanding, controlled code edits, diff/report generation, and validation preparation.
3. **PR-3 — Safe Execution, Testing, Health Monitor, Failover & Recovery.** Isolated execution, tests, health, fallback/recovery, and truthful status reporting.
4. **PR-4 — Approval-based GitHub Commit, Push & Pull Request.** Explicit approval for repository writes and PR operations; no merge without owner approval.

The Private Vault, device-only memory, separate Developer Repository, research intelligence, and secret entry UI are an additional architecture workstream. They must be mapped onto these stages only after the owner reviews and approves the design. This documentation PR does not authorize implementation or alter the four-PR scope.

## 12. Non-regression and preservation requirements

- Preserve all existing Badboy functionality and current production behavior.
- Do not replace the existing Native AI Engine or normal Chat/Voice routing.
- Do not expose Private Vault data to Normal Badboy, public users, or third-party providers.
- Do not make the current repository private or change repository visibility as part of this proposal.
- Do not create the separate Private Developer Repository as part of this documentation-only PR.
- Do not add dependencies, secrets, database migrations, API routes, UI components, workflows, or runtime changes in this PR.
- Do not run tests, deploy, migrate production data, publish an APK, or merge this PR as part of this planning task.

## 13. Decisions still required before implementation

The owner should review and decide:

- Whether the first Private Vault release is Android-only or also supports web/desktop.
- Exact Owner Secret enrollment, rotation, lockout, and recovery behavior.
- Whether any explicit encrypted offline export is allowed, or whether data loss on device loss is accepted.
- Which local model/runtime can realistically run on the target phone and what its resource limits are.
- The separate Developer Repository name and exact GitHub App permissions.
- Which research sources are approved and how frequently they are checked.
- Which sandbox runtime is supported and what network/command allowlist is acceptable.
- Which actions require per-action approval versus a bounded, revocable approval session.

No default should be interpreted as permission to weaken the device-only memory rule or owner-controlled merge rule.

## 14. This PR's change boundary

This PR adds this architecture document only. It intentionally does not implement, configure, test, deploy, migrate, or enable any of the proposed features. Review and explicit owner approval are required before implementation work begins.
