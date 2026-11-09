# Security exception register

## GHSA-gcqx-w48m-w2h4 — deepmerge 4.3.1

- Status: **disputed upstream advisory; narrowly allow-listed in Dependency Review**
- Dependency path: Expo configuration tooling (expo → @expo/config → deepmerge); build-time tooling, not shipped as a Badboy runtime dependency.
- GitHub Advisory Database currently lists this as Low and has no patched release: https://github.com/advisories/GHSA-gcqx-w48m-w2h4
- Upstream maintainer disputes the finding; the issue discussion records a reproduction review and a VulnCheck rejection of CVE-2026-93753: https://github.com/TehShrike/deepmerge/issues/273
- Policy: only this exact GHSA ID, package name, and Low severity are accepted. Any other advisory, any severity change, or any additional deepmerge advisory fails Dependency Review. Re-evaluate if the advisory status changes or an upstream patch is released.

This is a documented exception, not a claim that pnpm audit reported zero advisories.
