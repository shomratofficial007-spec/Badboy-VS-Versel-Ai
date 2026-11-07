# Static analysis and security tooling

This repository uses complementary scanners; none of them guarantees that the application is secure.

## CI tools

| Tool | Scope | How it runs |
| --- | --- | --- |
| CodeQL Advanced | Java/Kotlin, JavaScript/TypeScript, GitHub Actions | Existing `.github/workflows/codeql.yml`; the Android Kotlin source is generated/compiled through Expo Prebuild in CI. |
| SonarCloud | Maintainability and supported-language analysis | `.github/workflows/sonarcloud.yml` on pull requests and pushes to `main`. |
| Semgrep Community Edition | Security patterns and secret detection | `.github/workflows/semgrep.yml`; results are uploaded to GitHub code scanning. |
| Detekt | Kotlin static analysis | `.github/workflows/detekt.yml`; results are uploaded to GitHub code scanning. |

### SonarCloud setup

Add the SonarCloud access token to the repository's Actions secrets as `SONAR_TOKEN`.
The organization and project keys are committed in `sonar-project.properties`; never commit the token.
The workflow skips fork pull requests because GitHub does not expose repository secrets to them.

Coverage is not currently reported: the existing workspace test scripts do not yet produce an LCOV report. Do not interpret a missing coverage metric as 100% coverage.

### Detekt baseline

Detekt currently runs in advisory mode with a generous issue threshold so existing Kotlin code can be inventoried without making this tooling-only change unexpectedly block unrelated work. Review findings and lower the threshold deliberately after establishing a baseline.

## IDE tools

- **SonarLint / SonarQube for IDE** is an editor plugin, not a repository CI executable. Install the official Sonar plugin in Android Studio or VS Code and connect it to the SonarCloud project for connected mode.
- Detekt can also be run locally with the same pinned CLI and `config/detekt/detekt.yml`.

## SpotBugs and FindSecBugs

SpotBugs analyzes compiled JVM bytecode, and FindSecBugs extends it with security-focused detectors. The current repository's custom native module contains Kotlin sources only; there is no checked-in Android Gradle project (Expo Prebuild generates it during CI) and no maintained Java source module. A generic SpotBugs job against generated Android/dependency bytecode would produce misleading or noisy results.

For now, CodeQL covers the compiled Java/Kotlin path. Add SpotBugs + FindSecBugs when a maintained Java module or a stable, explicitly scoped bytecode target exists; do not run it against all generated Android dependency classes and call that complete coverage.
