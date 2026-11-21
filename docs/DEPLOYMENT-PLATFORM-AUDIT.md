# Deployment Platform Audit — Cloudflare-only target

**Audit date:** 2026-11-21  
**Audited branch:** `main`  
**Audited commit:** `ced5946d6c353304e4b192b8d75ef677e08de3ec`  
**Repository:** `shomratofficial007-spec/Badboy-VS-Versel-Ai`  
**Scope:** Tracked repository deployment/build/hosting configuration, all GitHub Actions workflows, root and workspace package manifests, mobile app build configuration, repository-level Replit configuration, and deployment-related documentation. This is an inventory only; no deployment configuration or application code was changed by this audit.

## Executive summary

The only production web-hosting/backend deployment target explicitly wired into the current `main` branch is **Cloudflare Workers**, configured through the root `wrangler.json` and `.github/workflows/deploy-cloudflare.yml`.

The repository still contains configuration for **Expo Application Services (EAS)** cloud app builds and an empty EAS production submit profile. This is an alternate mobile build/distribution capability, not an active web/backend hosting deployment in the checked-in automation. It should be treated as a potential non-Cloudflare release path until the owner decides whether EAS builds/submissions are allowed.

**Replit** is present as a development workspace configuration, not as a deployment target. **GitHub Actions artifact storage** is used for APK/SBOM/coverage artifacts; that is CI artifact hosting, not application hosting.

No current-main Vercel, Netlify, Render, Railway, Fly.io, Firebase Hosting, AWS Amplify, Heroku, Docker-based application deployment, or Cloudflare Pages deployment configuration was found in the tracked tree/configuration reviewed.

## Platform inventory

| Platform/service | Evidence in `main` | Current role | Deployment status |
|---|---|---|---|
| **Cloudflare Workers** | `wrangler.json`; root `package.json` `deploy` script; `.github/workflows/deploy-cloudflare.yml` | Single web host + API Worker; serves `artifacts/mobile/dist`; D1 binding `AGENT_DB` | **Configured production target** |
| **Cloudflare D1** | Root `wrangler.json`; `migrations/`; D1 validation/migration workflows | Production database attached to Worker | **Configured Cloudflare resource**, not a separate hosting platform |
| **Expo Application Services (EAS)** | `artifacts/mobile/eas.json` | Development, preview, and production Android build profiles; `submit.production` is empty | **Dormant/available alternate cloud build path**; no EAS CLI workflow, `EXPO_TOKEN`, or EAS submit command found in the inspected manifests/workflows |
| **Replit** | Root `.replit`, `.replitignore`, `replit.md`; mockup sandbox includes Replit Vite plugins | Development workspace/run-button configuration and editor tooling | **Development only**; no Replit deployment target/configuration found |
| **GitHub Actions artifacts** | `.github/workflows/android-apk.yml`, `android-apk-free.yml`, `nowsecure-mobile-sbom.yml`, `sonarcloud.yml` | Stores APK, SBOM, and coverage artifacts | **CI artifact storage only**, not app hosting |
| **GitHub Pages** | Repository metadata reports `has_pages: false` | None | **Not enabled according to repository metadata** |

## Cloudflare production deployment path

### Canonical configuration

- `wrangler.json`
  - Worker name: `badboy-vs-versel-ai`
  - Entry point: `functions/api/[[path]].ts`
  - Static asset directory: `./artifacts/mobile/dist`
  - D1 binding: `AGENT_DB` → `badboy-agent-db`
  - Worker dev/preview URLs enabled.
- `package.json`
  - `deploy`: `pnpm build && wrangler deploy --config wrangler.json`
- `.github/workflows/deploy-cloudflare.yml`
  - Runs on pushes to `main` and manual `workflow_dispatch`.
  - Builds with `pnpm build`, then executes `pnpm exec wrangler deploy --config wrangler.json`.
  - Uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

This workflow is an automatic production deployment trigger on `main` pushes. A source-level trigger is confirmed; whether a particular post-merge run completed successfully must be verified from that workflow's run history/Cloudflare deployment state.

### Other Cloudflare workflows (not alternate app hosts)

- `check-production-d1-status.yml`: manual, read-only production D1 schema inspection.
- `initialize-production-d1-migration-tracking.yml`: production D1 migration metadata initialization; also has a push trigger limited to changes to that workflow file.
- `migrate-production-d1.yml`: manually confirmed production D1 migrations.
- `test-wrangler-4-162-d1-readonly.yml`: read-only remote D1 diagnostics.
- `ci.yml`, `ethicalcheck.yml`, and `required-validation.yml`: local/dry-run Worker validation and local D1 migration tests; these are not production deployment workflows.

## Residual non-Cloudflare configuration to decide

### 1. Expo EAS — mobile build/release service

File: `artifacts/mobile/eas.json`

It defines `development`, `preview`, and `production` build profiles. The production profile requests an Android App Bundle, and a `submit.production` object exists but is empty.

Evidence checked:
- No `eas build` or `eas submit` command found in the 21 checked-in GitHub Actions workflows.
- No `EXPO_TOKEN` reference found in the inspected workflow set.
- No `eas-cli` dependency found in the inspected workspace package manifests.

Interpretation: EAS is not shown as an active automated backend/web deployment path, but its build profile remains a potential alternate cloud build/release path. Owner decision required before removing or retaining it.

### 2. Replit — development workspace

Files: `.replit`, `.replitignore`, `replit.md`, and Replit Vite plugins in `artifacts/mockup-sandbox/package.json`.

The `.replit` file configures Node.js, PNPM workspace tooling, a project run button, and Nix packages. No Replit deployment target, deployment workflow, or deployment command was found. `replit.md` explicitly documents local development and the Cloudflare Worker as the hosting/backend.

Interpretation: Replit appears to be a development environment only, not an app deployment target.

## Platforms not found in current-main deployment configuration

The recursive Git tree contained 425 entries and was not truncated. The platform-specific path/configuration scan found no current-main deployment manifests for:

- Vercel
- Netlify
- Render
- Railway
- Fly.io
- Firebase Hosting
- AWS Amplify
- Heroku
- Docker/Compose application hosting
- Cloudflare Pages

The strings `vercel` and `replit` do occur in non-deployment contexts (for example, a legacy branch name in workflow filters and development tooling). Those references alone do not establish a deployment target.

## Audit coverage and limits

- Enumerated the complete recursive `main` Git tree: 425 entries; GitHub reported `truncated: false`.
- Enumerated and inspected all 21 checked-in GitHub Actions workflow files for deployment, publish, hosting, build, upload, and environment triggers.
- Inspected root and mobile package manifests, root `wrangler.json`, mobile `eas.json` and `app.json`, Replit workspace files, deployment guides, and Android artifact workflows.
- Checked package manifests for platform-specific deployment CLIs/dependencies.
- Repository source does not expose account-dashboard settings, connected third-party project settings, provider secrets, or external platform deployment histories. Those cannot be proven absent from GitHub source alone.
- GitHub repository metadata reports Pages disabled. A live audit of Cloudflare dashboard state, Workers Builds settings, EAS account projects, or Replit account deployments was not available through this source inspection.
- This PR intentionally records findings only. It does not remove configuration, change workflows, delete credentials, modify D1, deploy, or disable any service.

## Decision requested from repository owner

Before any cleanup or migration, decide:

1. Is **Cloudflare Workers + D1** the only allowed production web/backend hosting platform? The repository currently supports this.
2. Should **Expo EAS cloud builds/submissions** be prohibited as well, or are they allowed solely for Android/iOS packaging while Cloudflare remains the only backend/web host?
3. Should the **Replit development workspace** be retained as a non-deployment development environment?

No platform configuration has been changed in this audit PR.
