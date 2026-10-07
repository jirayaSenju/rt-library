# Project Workflow

- Use `main` as the protected integration branch. Do not commit directly to `main`.
- Start each change from the latest `main` on the development branch named `dev`. If `dev` is missing, create it from `main`. Open a Pull Request from `dev` to `main`.
- Use Conventional Commit messages: `<type>(optional-scope): description`. Use `feat` for features, `fix` for bug fixes, and the appropriate types such as `docs`, `test`, `refactor`, `perf`, `build`, `ci`, or `chore` for other work.
- Apply Semantic Versioning (`MAJOR.MINOR.PATCH`) from Conventional Commit types: `feat` means MINOR; `fix`, `perf`, and `revert` mean PATCH; incompatible changes marked with `!` or a `BREAKING CHANGE:` footer mean MAJOR.
- Documentation-only changes use `docs:` and do not bump the application version or get a release tag. `test`, `ci`, and maintenance-only commits do not trigger a release on their own. Release tags are for `feat`, `fix`, `perf`, `revert`, or non-documentation breaking changes since the previous release.
- Run relevant local checks, then wait for every required GitHub Actions check on the Pull Request. Merge only when all required checks pass. If checks fail, fix the issue on `dev`, push the fix, and wait for Actions again.
- Keep `dev` synchronized with updated `main` after each merge and before starting the next change.
- Prepare release version and changelog changes on `dev` through the same Pull Request flow. Create and push the SemVer tag only after the change has merged into `main`; follow [docs/releasing.md](docs/releasing.md).
- For the maintainer's local checkout, use SSH alias `jiraya` for `origin` and Git identity `Jiraya Senju <bubble.jiraya@vista.aero>`. Verify SSH authentication with `ssh -T git@jiraya`; commit email controls GitHub author attribution.
- Do not force-push or rewrite published history.
