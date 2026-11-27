# Security Policy

## Supported versions

The repository currently has no published versioned releases. Until the first tagged release is published, security fixes are maintained on the latest `main` branch. No older release series is currently designated as supported.

| Version | Security support |
| --- | --- |
| Latest `main` | Supported |
| Tagged releases | No published releases yet |

When versioned releases are introduced, this table will be updated with their support status.

## Reporting a vulnerability

Please do not disclose suspected vulnerabilities in public GitHub issues, discussions, or pull requests.

1. Open this repository's **Security** tab and use **Report a vulnerability** if GitHub makes private vulnerability reporting available.
2. If that option is unavailable, contact the repository owner through [the GitHub owner profile](https://github.com/shomratofficial007-spec) and request a private disclosure channel. Do not include exploit details or sensitive data in a public message.

A useful private report includes the affected component and commit/ref, the security impact, reproducible steps or a proof of concept, and any relevant logs with credentials and personal data removed. Do not send API keys, owner tokens, session tokens, or production data.

## Triage and disclosure

There is currently no published response-time SLA. Maintainers will review reports privately, confirm the affected code and impact, and coordinate remediation and disclosure with the reporter. Please allow time for validation before making technical details public.

## Security-sensitive project areas

Reports involving any of the following are in scope:

- Cloudflare Worker API routes, authentication, owner-token handling, and D1 data isolation
- AI provider routing, custom provider URLs, redirects, request limits, and streaming
- Mobile secure storage, voice permissions, and native Android modules
- Third-party integration credentials, approval boundaries, and data access
- GitHub Actions workflows, build artifacts, dependency integrity, and secret handling

Never test against production accounts, production databases, or third-party systems without authorization.