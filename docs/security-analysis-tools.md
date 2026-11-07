# Static analysis and security tooling

This repository uses complementary scanners; none of them guarantees that the application is secure.

## CI tools

| Tool | Scope | How it runs |
| --- | --- | --- |
| CodeQL Advanced | Java/Kotlin, JavaScript/TypeScript, GitHub Actions | Existing `.github/workflows/codeql.yml`; the Android Kotlin source is generated/compiled through Expo Prebuild in CI. |
| SonarCloud | Maintainability, supported-language analysis, and test coverage | `.github/workflows/sonarcloud.yml` runs workspace tests, creates `coverage/lcov.info`, then submits analysis on pull requests and pushes to `main`. |
| Semgrep Community Edition | Security patterns and secret detection | `.github/workflows/semgrep.yml`; results are uploaded to GitHub code scanning. |
| Detekt | Kotlin static analysis | `.github/workflows/detekt.yml`; results are uploaded to GitHub code scanning. |

### SonarCloud setup

Add the SonarCloud access token to the repository's Actions secrets as `SONAR_TOKEN`.
The organization and project keys are committed in `sonar-project.properties`; never commit the token.
The workflow skips fork pull requests because GitHub does not expose repository secrets to them.

The SonarCloud workflow installs the locked workspace dependencies, runs all workspace test scripts under the pinned `c8` coverage runner, verifies that the LCOV report is non-empty, and then runs the SonarCloud scanner. Coverage is reported only for executed, instrumented source lines; untested files remain uncovered and the percentage is not a claim of complete test coverage.

### SonarLint / SonarQube for IDE

- **VS Code:** this repository recommends the official `SonarSource.sonarlint-vscode` extension through `.vscode/extensions.json`. Open Extensions and install the recommended SonarQube for IDE extension.
- **Android Studio:** open Settings/Preferences → Plugins → Marketplace, search for **SonarQube for IDE** (formerly SonarLint), install it, and restart the IDE.
- For connected mode, configure the SonarQube Cloud connection using the user's own IDE sign-in/token flow and bind the IDE project to the SonarCloud project. Do not put personal IDE tokens in repository files or commit them.

### Detekt baseline

Detekt currently runs in advisory mode with a generous issue threshold so existing Kotlin code can be inventoried without making this tooling-only change unexpectedly block unrelated work. Review findings and lower the threshold deliberately after establishing a baseline.

## SpotBugs and FindSecBugs

SpotBugs analyzes compiled JVM bytecode, and FindSecBugs extends it with security-focused detectors. The current repository's custom native module contains Kotlin sources only; there is no checked-in Android Gradle project (Expo Prebuild generates it during CI) and no maintained Java source module. A generic SpotBugs job against generated Android/dependency bytecode would produce misleading or noisy results.

For now, CodeQL covers the compiled Java/Kotlin path. Add SpotBugs + FindSecBugs when a maintained Java module or a stable, explicitly scoped bytecode target exists; do not run it against all generated Android dependency classes and call that complete coverage.
