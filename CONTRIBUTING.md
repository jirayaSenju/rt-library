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

## AI-Assisted Contributions

AI-assisted development tools (such as LLMs, copilots, and AI coding assistants) are welcome to assist in drafting contributions to RT-Library. However, all contributors must adhere to the following standards:

1. **Contributor Responsibility**: Contributors remain fully responsible for understanding, reviewing, and validating all submitted changes. AI-generated code must never be submitted without thorough human comprehension and review.
2. **Verification & Testing**: AI-suggested code must be accompanied by appropriate automated tests and verified against real runtime behavior where applicable.
3. **Dependency Integrity**: Do not blindly introduce new dependencies suggested by AI tools without validating necessity, package reputation, and license compatibility (`npm run audit:licenses`).
4. **Data Privacy in Prompts & Fixtures**: Never paste user session cookies, credentials, real torrent datasets, or copyrighted content into AI prompts or test fixtures.
5. **No Hallucinated Claims**: Ensure documentation and comments accurately describe the real codebase rather than theoretical or imagined behavior.

---

## Submitting Pull Requests

1. Create a feature branch from `main`.
2. Ensure all automated checks pass:
   ```bash
   npm test
   npm run build
   npm run release:check
   ```
3. Open a Pull Request filling out all items in the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md).
