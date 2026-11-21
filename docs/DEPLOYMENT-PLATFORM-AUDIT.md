# Deployment Platform Audit — Cloudflare-only target

**Audit date:** 2026-11-21  
**Audited branch:** `main`  
**Audited commit:** `ced5946d6c353304e4b192b8d75ef677e08de3ec`  
**Repository:** `shomratofficial007-spec/Badboy-VS-Versel-Ai`  
**Scope:** Complete tracked Git tree, all checked-in GitHub Actions workflows, root and workspace package manifests/lockfile indicators, mobile build/update/store configuration, Replit/devcontainer configuration, deployment guides, and platform-specific deployment manifests/commands. This is an inventory only; no deployment configuration or application code was changed by this audit.

## Executive summary

The only production web-hosting/backend deployment target explicitly wired into the current `main` branch is **Cloudflare Workers**, configured through the root `wrangler.json` and `.github/workflows/deploy-cloudflare.yml`.

The second-pass audit also checked mobile cloud build, OTA update, app-store submission, local preview, and development-workspace paths. It confirmed these distinctions:

- **Expo Application Services (EAS)** has development, preview, and production Android build profiles in `artifacts/mobile/eas.json`. This is a potential non-Cloudflare cloud build/release service, but the repository does not wire an EAS build/submit workflow.
- **Expo Updates / EAS Update** is not configured in `artifacts/mobile/app.json`: no `updates.url`, EAS `projectId`, or `expo-updates` dependency was found in the inspected mobile manifest/configuration. This does not prove the Expo account has no project; it means the tracked app configuration does not establish an OTA update target.
- **Google Play / Apple App Store publishing** is not wired in the checked-in workflows. The EAS `submit.production` object is empty; Android workflows build and upload GitHub artifacts rather than publish to a store.
- **Replit** and **Dev Containers** are development environments, not confirmed production deployment targets.
- **GitHub Actions artifacts** are CI output storage, not app hosting.
- The PR preview deployment observed for this audit was a **Cloudflare Workers preview** (`.workers.dev`), not a second provider.

No current-main deployment configuration was found for Vercel, Netlify, Render, Railway, Fly.io, Firebase Hosting, AWS Amplify, Heroku, Docker/Compose application hosting, Cloudflare Pages, or the other platform-specific manifests listed below.

## Platform inventory

| Platform/service | Evidence in `main` | Current role | Deployment status |
|---|---|---|---|
| **Cloudflare Workers** | `wrangler.json`; root `package.json` `deploy` script; `.github/workflows/deploy-cloudflare.yml` | Single web host + API Worker; serves `artifacts/mobile/dist`; D1 binding `AGENT_DB` | **Configured production target** |
| **Cloudflare Workers Preview URLs** | `wrangler.json` has `preview_urls: true`; Cloudflare PR preview bot reported a successful preview deployment to a `.workers.dev` URL | Per-PR preview of the Worker | **Confirmed Cloudflare preview deployment**, not another provider |
| **Cloudflare D1** | Root `wrangler.json`; `migrations/`; D1 validation/migration workflows | Production database attached to Worker | **Configured Cloudflare resource**, not a separate hosting platform |
| **Expo Application Services (EAS)** | `artifacts/mobile/eas.json` | Development, preview, and production Android build profiles; `submit.production` is empty | **Available alternate cloud mobile-build path**; no EAS CLI workflow, `EXPO_TOKEN`, or EAS submit command found in checked-in workflows/manifests |
| **Expo Updates / EAS Update** | `artifacts/mobile/app.json`, `artifacts/mobile/package.json` | OTA update delivery would require additional project/update configuration | **No OTA update target configured in tracked app config**; external Expo account state not visible |
| **Google Play / Apple App Store** | EAS submit profile and Android GitHub Actions workflows | Mobile app distribution | **No store-publishing automation found**; submit profile is empty and APK/AAB CI outputs are artifacts |
| **Replit** | Root `.replit`, `.replitignore`, `replit.md`; mockup sandbox includes Replit Vite plugins | Development workspace/run-button configuration and editor tooling | **Development only in tracked config**; no Replit deployment target/configuration found |
| **Dev Containers / VS Code** | `.devcontainer/devcontainer.json`, `.vscode/extensions.json` | Local/cloud development environment setup | **Development environment only**; no application deployment target |
| **GitHub Actions artifacts** | `.github/workflows/android-apk.yml`, `android-apk-free.yml`, `nowsecure-mobile-sbom.yml`, `sonarcloud.yml` | Stores APK, SBOM, and coverage artifacts | **CI artifact storage only**, not app hosting |
| **GitHub Pages** | Repository metadata reported `has_pages: false` in the prior metadata check | None | **Not enabled according to repository metadata** |

## Cloudflare production deployment path

### Canonical configuration

- `wrangler.json`
  - Worker name: `badboy-vs-versel-ai`
  - Entry point: `functions/api/[[path]].ts`
  - Static asset directory: `./artifacts/mobile/dist`
  - D1 binding: `AGENT_DB` → `badboy-agent-db`
  - `workers_dev` and `preview_urls` are enabled.
- `package.json`
  - `deploy`: `pnpm build && wrangler deploy --config wrangler.json`
- `.github/workflows/deploy-cloudflare.yml`
  - Runs on pushes to `main` and manual `workflow_dispatch`.
  - Builds with `pnpm build`, then executes `pnpm exec wrangler deploy --config wrangler.json`.
  - Uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

This workflow is an automatic production deployment trigger on `main` pushes. A source-level trigger is confirmed; whether a particular post-merge run completed successfully must be verified from that workflow's run history/Cloudflare deployment state.

### Preview deployment evidence

The Cloudflare deployment bot commented on PR #124 that the preview build and deployment succeeded for commit `47341d3`, with a `.workers.dev` preview URL. This is evidence of a Cloudflare preview deployment only; it does not indicate deployment to a separate hosting provider.

### Other Cloudflare workflows (not alternate app hosts)

- `check-production-d1-status.yml`: manual, read-only production D1 schema inspection.
- `initialize-production-d1-migration-tracking.yml`: production D1 migration metadata initialization; also has a push trigger limited to changes to this workflow file.
- `migrate-production-d1.yml`: manually confirmed production D1 migrations.
- `test-wrangler-4-162-d1-readonly.yml`: read-only remote D1 diagnostics.
- `ci.yml`, `ethicalcheck.yml`, and `required-validation.yml`: local/dry-run Worker validation and local D1 migration tests; these are not production deployment workflows.

## Residual non-Cloudflare configuration to decide

### 1. Expo EAS — mobile cloud build/release service

File: `artifacts/mobile/eas.json`

It defines `development`, `preview`, and `production` build profiles. The production profile requests an Android App Bundle, and a `submit.production` object exists but is empty.

Evidence checked:
- No `eas build` or `eas submit` command found in the checked-in GitHub Actions workflows.
- No `EXPO_TOKEN` reference found in the inspected workflow set.
- No `eas-cli` dependency found in the inspected workspace package manifests.

Interpretation: EAS is not shown as an active automated backend/web deployment path, but its build profile remains an available alternate cloud mobile-build/release path. Owner decision required before removing or retaining it.

### 2. Expo OTA updates — no tracked deployment target

Files: `artifacts/mobile/app.json`, `artifacts/mobile/package.json`

The checked-in Expo app config has no `updates.url` or EAS `projectId`, and the mobile package manifest does not declare `expo-updates`. No EAS Update command/workflow was found in the checked-in automation.

Interpretation: no Expo OTA update service is configured by the tracked app files inspected. An Expo account project or externally configured service cannot be ruled out from repository source alone.

### 3. Replit and Dev Containers — development environments

Files: `.replit`, `.replitignore`, `replit.md`, `.devcontainer/devcontainer.json`, `.vscode/extensions.json`, and `artifacts/mockup-sandbox/package.json`.

The Replit files configure a Node.js/PNPM development workspace and run button; the devcontainer config supports a development environment. The mockup sandbox uses Replit Vite editor plugins and has a local `vite preview` script. No Replit deployment target, deployment workflow, or hosting command was found. A Vite `preview` script serves a local build for inspection; it is not itself a production hosting provider.

Interpretation: these are development/preview tools in the tracked repository, not evidence of an externally deployed production app.

### 4. Mobile artifact distribution

The Android workflows build APK outputs and upload them as GitHub Actions artifacts. No Google Play publishing action, App Store Connect upload, Fastlane release lane, or EAS submit invocation was found in the checked-in workflows. The empty EAS submit profile does not configure a store destination.

Interpretation: CI artifact download is present; store publishing is not wired in repository automation.

## Platforms and deployment manifests not found in current-main tracked tree

The recursive Git tree contained 425 entries and was not truncated. The platform-specific filename/configuration scan found no current-main deployment manifests or conventional deployment entry points for:

- Vercel (`vercel.json`, Vercel CLI deployment workflow)
- Netlify (`netlify.toml`, Netlify Functions/deploy workflow)
- Render (`render.yaml`)
- Railway (`railway.json`, `railway.toml`)
- Fly.io (`fly.toml`)
- Firebase Hosting (`firebase.json`, `.firebaserc`)
- AWS Amplify (`amplify.yml`)
- Heroku (`Procfile`, Heroku app deployment workflow)
- Docker/Compose application hosting (`Dockerfile`, `docker-compose.yml` / `compose.yaml` deployment setup)
- Kubernetes/Helm application hosting (deployment manifests / charts)
- Serverless Framework deployment (`serverless.yml`)
- Google App Engine / Cloud Run deployment (`app.yaml`, Cloud Run deploy workflow)
- Azure App Service deployment manifests/workflows
- DigitalOcean App Platform (`app spec` / deploy workflow)
- Cloudflare Pages deployment configuration (Pages project/build configuration)

The repository does contain local build/preview scripts, CI artifact uploads, and references to platform names in non-deployment contexts. Those are not sufficient evidence of a production deployment target.

## Audit coverage and limits

- Enumerated the complete recursive `main` Git tree: 425 entries; GitHub reported `truncated: false`.
- Enumerated and inspected all 21 checked-in GitHub Actions workflow files for deployment, publish, hosting, build, upload, and environment triggers.
- Inspected root and workspace package manifests, root `wrangler.json`, mobile `eas.json` and `app.json`, Replit/devcontainer workspace files, deployment guides, and Android artifact workflows.
- Checked package manifests for platform-specific deployment CLIs/dependencies and mobile OTA/store publishing configuration.
- Repository source does not expose account-dashboard settings, connected third-party project settings, provider secrets, or external platform deployment histories. Those cannot be proven absent from GitHub source alone.
- GitHub repository metadata reported Pages disabled in the prior metadata check. A live audit of Cloudflare dashboard state, Workers Builds settings, EAS account projects, Replit account deployments, or third-party hosting accounts was not available through this source inspection.
- This PR intentionally records findings only. It does not remove configuration, change workflows, delete credentials, modify D1, deploy, or disable any service.

## Decision requested from repository owner

Before any cleanup or migration, decide:

1. Is **Cloudflare Workers + D1** the only allowed production web/backend hosting platform? The repository currently supports this.
2. Should **Expo EAS cloud builds/submissions** be prohibited as well, or are they allowed solely for Android/iOS packaging while Cloudflare remains the only backend/web host?
3. Should the **Replit development workspace** be retained as a non-deployment development environment?

No platform configuration has been changed in this audit PR.
