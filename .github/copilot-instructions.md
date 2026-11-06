# Badboy repository instructions

## Project boundaries
- This repository is the Badboy AI application and its Cloudflare Worker/API. Preserve the existing application identity, features, architecture, and user-facing behavior.
- Make the smallest focused change that solves the requested task. Do not rebuild the project or remove, rename, or replace existing files/features unless the user explicitly approves it.
- Treat the mobile app, API server, Cloudflare Worker, voice, wake-word, memory, and deployment workflows as production-sensitive areas.

## Required workflow
- Work on a dedicated feature or fix branch; never commit directly to `main`.
- Inspect the relevant implementation and tests before editing.
- Add or update focused tests for behavior changes.
- Use the repository's existing pnpm workspace and scripts. The pinned package manager is pnpm 10.8.1 and Node.js 22 is used in CI.
- Run the narrowest relevant tests and typechecks, then the repository build when practical.
- Summarize changed files, tests actually run, results, and any remaining uncertainty.

## Safety and deployment
- Never expose, print, commit, or copy secrets, API tokens, signing keys, or user data into logs, source files, issues, or pull requests.
- Never trigger production deployment, publish a release, merge a pull request, or build/distribute an Android APK unless the user explicitly authorizes that exact action.
- The Cloudflare production workflow deploys on pushes to `main`; do not push changes to `main`.
- Do not claim a test, deployment, or runtime behavior succeeded unless it was actually verified.
- Prefer a draft pull request for review. Do not merge it.

## Dependency and supply-chain rules
- Preserve the root pnpm workspace configuration, lockfile integrity, overrides, and the existing `minimumReleaseAge: 1440` protection.
- Do not disable or weaken dependency security controls to make installation pass.
- Avoid unnecessary dependency additions; explain why a new dependency is needed.
