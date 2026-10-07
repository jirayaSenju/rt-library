# Contributing to RT-Library

Thank you for your interest in contributing to RT-Library!

Contributions from everyone are welcome. We encourage contributions in many forms, including:
- **Bug Fixes**: Resolving issues, edge cases, and unexpected behaviors.
- **Documentation**: Improving guides, architectural docs, API references, and inline comments.
- **Translations & Locales**: Enhancing existing localizations or adding new supported languages.
- **Accessibility**: Improving keyboard navigation, screen reader support, and high-contrast color palettes.
- **UI/UX Refinements**: Enhancing usability, layout responsiveness, transitions, and visual polish.
- **Performance Optimizations**: Improving database query latency, virtual list rendering, and memory efficiency.
- **New Features**: Extending metadata management, view customizations, and personal organization tools.
- **Tests & Quality Assurance**: Expanding unit, integration, contrast, and end-to-end test coverage.
- **Platform Compatibility**: Enhancing desktop integration and packaging on Linux and Windows.

---

## Contribution Licensing & Governance

### Inbound=Outbound Licensing
By submitting a contribution (including code, tests, documentation, design assets, or bug fixes) to RT-Library, you agree that your contribution is licensed under the [MIT License](LICENSE) used by the project.

### No Contributor License Agreement (CLA)
RT-Library does **not** require a signed Contributor License Agreement (CLA) or copyright assignment. You retain copyright to your original contributions while granting the standard permissive rights provided by the MIT License to the project and its users.

### Contributor Representation
You must only submit material that you authored or have the legal right to contribute under the terms of the MIT License.

---

## Development Setup

1. **Prerequisites**: Node.js `>= 18.0.0` and npm `>= 9.0.0`.
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Start development server**:
   ```bash
   npm run desktop
   ```

---

## Contribution Guidelines

### 1. Code Standards
- Write clean, type-safe TypeScript.
- Follow established project architecture (React UI in `src/`, Electron backend in `electron/`, Scraper logic in `scraper/`).
- Preserve process isolation: never import Node.js built-ins (`fs`, `path`, `child_process`) inside `src/`. Always use the `window.rtLibrary` IPC bridge.

### 2. Testing & Quality Assurance
- Run existing test suites before submitting changes:
  ```bash
  npm test
  ```
- Add unit or integration tests for new features and bug fixes in `tests/unit/` or `tests/integration/`.
- Ensure build and publication readiness checks pass cleanly:
  ```bash
  npm run build
  npm run release:check
  ```

### 3. Safety & Privacy Rules
- **No Scraped Datasets**: Do not commit real catalog dumps, JSON datasets, or bulk topic listings.
- **No Copyrighted Media**: Do not include copyrighted images, ROMs, or torrent files in pull requests.
- **No Credentials or Sessions**: Never commit cookies, tokens, `storageState`, or `.env` files.
- **Sanitized Fixtures**: Test fixtures must use minimal synthetic data with fake identifiers and sample URLs (`example.invalid`).

---

## Development Workflow, Commits, and Versions

Use `main` as the protected integration branch and `dev` as the development branch. Start from the latest `main`; if `dev` does not exist, create it from `main`. Do not commit directly to `main`.

Write commits using [Conventional Commits](https://www.conventionalcommits.org/), with the format `<type>(optional-scope): description`. Common types include `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, and `chore`.

Use Semantic Versioning (`MAJOR.MINOR.PATCH`) for application releases, based on Conventional Commit types:

- `feat` requires a `MINOR` version bump.
- `fix`, `perf`, and `revert` require a `PATCH` version bump.
- An incompatible change marked with `!` (for example, `feat(api)!:`) or a `BREAKING CHANGE:` footer requires a `MAJOR` bump.
- Documentation-only changes use `docs:` and do not bump the application version or create a release tag. `test`, `ci`, and maintenance-only commits do not trigger a release by themselves.
- Use the release version that reflects the highest-impact release-worthy change since the previous release.

For this maintainer's checkout, keep `origin` pointed at `git@jiraya:jirayaSenju/rt-library.git` and use the Git identity `Jiraya Senju <bubble.jiraya@vista.aero>`. SSH selects the GitHub account used for authentication; the commit email determines GitHub's author attribution. Confirm the account with `ssh -T git@jiraya` before pushing.

## AI-Assisted Contributions

AI-assisted development tools (such as LLMs, copilots, and AI coding assistants) are welcome to assist in drafting contributions to RT-Library. However, all contributors must adhere to the following standards:

1. **Contributor Responsibility**: Contributors remain fully responsible for understanding, reviewing, and validating all submitted changes. AI-generated code must never be submitted without thorough human comprehension and review.
2. **Verification & Testing**: AI-suggested code must be accompanied by appropriate automated tests and verified against real runtime behavior where applicable.
3. **Dependency Integrity**: Do not blindly introduce new dependencies suggested by AI tools without validating necessity, package reputation, and license compatibility (`npm run audit:licenses`).
4. **Data Privacy in Prompts & Fixtures**: Never paste user session cookies, credentials, real torrent datasets, or copyrighted content into AI prompts or test fixtures.
5. **No Hallucinated Claims**: Ensure documentation and comments accurately describe the real codebase rather than theoretical or imagined behavior.

---

## Submitting Pull Requests

1. Update local `main` from `origin/main` and create or synchronize `dev` from it.
2. Make the change on `dev`, add or update relevant tests, and commit with a Conventional Commit message.
3. Push `dev` and open a Pull Request targeting `main`, filling out the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md).
4. Wait for every required GitHub Actions check to finish successfully. If a check fails, fix the issue on `dev`, push the correction, and wait for the checks again.
5. Merge the Pull Request only after all required checks pass. Keep `dev` synchronized with updated `main` before starting the next change.

Run the relevant local checks before opening the Pull Request:
```bash
npm test
npm run build
npm run audit:licenses
npm run release:check
```

Release version updates follow the same `dev` → Pull Request → passing Actions → merge flow. Create and push a release tag only when the commits since the previous release include `feat`, `fix`, `perf`, `revert`, or a non-documentation breaking change. Documentation-only PRs still require passing Actions and a merge, but do not need a version bump or release; see [Release & Versioning Guide](docs/releasing.md).
