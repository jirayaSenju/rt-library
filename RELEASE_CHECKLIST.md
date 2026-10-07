# RT-Library Release Checklist

This checklist must be strictly completed and verified prior to any public release or tag creation of RT-Library.

---

## 1. Source Safety & Repository Sanitation

- [ ] No SQLite databases (`*.sqlite`, `*.sqlite3`, `*.db`, `*.sqlite-wal`, `*.sqlite-shm`)
- [ ] No catalog JSON dumps or pre-populated lists
- [ ] No magnet datasets or batch URI dumps
- [ ] No `.torrent` metadata files
- [ ] No scraped covers, artwork, or screenshot image files
- [ ] No diagnostics dumps (`diagnostics/` or runtime dumps)
- [ ] No browser profiles (`scraper-profile/`, `playwright-profile/`, `.userData/`)
- [ ] No cookies or storage state (`cookies.json`, `storageState.json`)
- [ ] No secrets, private keys, or API tokens
- [ ] No machine-specific developer absolute paths (e.g. `/home/<user>/...`)
- [ ] `.gitignore` contains all mandatory safety exclusions

---

## 2. Open Source Licensing & Governance

- [ ] Project `LICENSE` is present with full MIT text
- [ ] `package.json` `license` is set to `"MIT"`
- [ ] `README.md` includes the License section referencing [LICENSE](LICENSE)
- [ ] `CONTRIBUTING.md` documents inbound=outbound MIT contribution licensing
- [ ] No mandatory Contributor License Agreement (CLA) or copyright assignment required
- [ ] `docs/license-selection.md` reflects `SELECTED (MIT)` status
- [ ] `THIRD_PARTY_NOTICES.md` is complete and up to date
- [ ] `THIRD_PARTY_LICENSES.txt` is complete and bundled in build outputs
- [ ] `docs/third-party-license-audit.md` verified with zero unresolved licenses

---

## 3. Versioning & SemVer Consistency

- [ ] Commits since the previous release include a release-worthy code type (`feat`, `fix`, `perf`, `revert`, or a non-documentation breaking change)
- [ ] Documentation-only `docs:` changes do not bump the application version or create a release tag
- [ ] Release version and changelog changes were made on `dev` and merged to `main` through a Pull Request
- [ ] All required GitHub Actions checks passed before the Pull Request was merged
- [ ] `package.json` version updated to target SemVer (`MAJOR.MINOR.PATCH`)
- [ ] `package-lock.json` version synchronized with `package.json`
- [ ] `CHANGELOG.md` updated with release header `[MAJOR.MINOR.PATCH] - YYYY-MM-DD` and feature notes
- [ ] Release version validator passes (`npm run release:validate`)
- [ ] Annotated Git tag `vMAJOR.MINOR.PATCH` matches `package.json.version` exactly
- [ ] Release tag was created from the merged commit on `main`

---

## 4. Tests & Quality Assurance

- [ ] `npm test` passes completely (all unit, integration, contrast, and benchmark suites)
- [ ] `npm run build` passes with zero TypeScript/Vite compilation errors
- [ ] `npm run release:check` passes with zero blockers
- [ ] `npm run audit:licenses` passes with zero missing/unknown licenses
- [ ] Source dependency license audit passes
- [ ] Packaged component license audit passes

---

## 5. Continuous Integration (CI)

- [ ] Linux CI runner (`ubuntu-latest`) passes all checks
- [ ] Windows CI runner (`windows-latest`) passes all checks
- [ ] Least-privilege permissions verified (`contents: read` for pull requests)
- [ ] Fork-safe execution verified (no secrets exposed)

---

## 6. Linux Packaging & Verification

- [ ] Linux AppImage generated via `npm run package:linux` (`RT-Library-${version}-linux-x86_64.AppImage`)
- [ ] `npm run package:verify` passes on packaged `app.asar` (zero forbidden files)
- [ ] Inspect AppImage archive contents (`npm run package:inspect`)
- [ ] Native module `better-sqlite3` verified in `app.asar.unpacked`
- [ ] `THIRD_PARTY_LICENSES.txt`, `LEGAL.md`, and `LICENSE` bundled inside package
- [ ] Electron/Chromium notices (`LICENSES.chromium.html`) included in distribution

---

## 7. Windows Packaging & Verification

- [ ] Windows NSIS setup installer generated on Windows runner (`RT-Library-${version}-windows-x64-setup.exe`)
- [ ] Native `better-sqlite3` compiled for Electron Windows x64
- [ ] Package verification passes with zero local data or cookies bundled
- [ ] Code signing status documented (`WINDOWS_CODE_SIGNING: NOT CONFIGURED`)

---

## 8. Packaged Runtime Safety

- [ ] No local user data or `.userData/` included in binary packages
- [ ] No scraper browser profile or cache included in binary packages
- [ ] No diagnostics or temporary logs included in binary packages
- [ ] No cached covers or screenshots included in binary packages

---

## 9. Documentation & Version Consistency

- [ ] `README.md` is current (accurate theme count, locale count, feature descriptions, and Releases section)
- [ ] `CHANGELOG.md` reflects all recent changes and features
- [ ] Supported languages list in documentation matches `SUPPORTED_LOCALES` (EN, PT-BR, RU)
- [ ] Supported themes list matches `THEMES` (14 themes) and `PROGRESS_THEMES` (11 progress styles)
- [ ] Installation steps in `docs/installation.md`, `docs/building.md`, and `docs/releasing.md` are validated
- [ ] `docs/data-storage.md` accurately reflects platform user data paths
- [ ] `docs/scraper.md` accurately reflects incremental and refresh scan semantics

---

## 10. Backend / SQLite Performance

- [ ] Backend benchmark completed (`npm run benchmark`)
- [ ] Cold database initialization with 15,000 items tested (< 500 ms)
- [ ] Catalog query latency measured (< 1 ms p50 for 48 items)
- [ ] Faceted multi-filtering latency measured (< 10 ms)
- [ ] Database backup snapshot and vacuum latency measured
- [ ] Backup scheduler single-trigger verified

---

## 11. Real Electron UI Performance

- [ ] Real Electron UI benchmark completed (`npm run benchmark:electron`)
- [ ] Renderer metrics collected (initial render, scroll frame rate)
- [ ] GPU process compositing metrics collected
- [ ] Total application RSS measured and verified (< 250 MB baseline)
- [ ] Virtualized Grid & List scroll interaction verified
- [ ] 50 Item Detail modal reopen cycles verified (`NO SUSTAINED MEMORY GROWTH DETECTED`)
- [ ] Scraper child process completion cleanup verified (`0` orphan processes)
- [ ] Scraper cancellation cleanup verified (`0` orphan processes)
- [ ] Scheduled backup memory stabilization verified
- [ ] Sustained soak test verified
- [ ] Idle CPU measured and investigated if consistently above target (~2%)
- [ ] Linux validated
- [ ] Windows validated or marked `NOT TESTED ON WINDOWS`
- [ ] Preliminary hardware guidance documented in `docs/performance-benchmark.md`

---

## 12. Automated Release & Deployment

- [ ] Release pipeline triggered exclusively via SemVer tag `v*.*.*`
- [ ] `validate` gate passes before build jobs start
- [ ] Build jobs run on native platform runners (`ubuntu-latest` and `windows-latest`)
- [ ] Exactly expected artifacts collected (1 AppImage, 1 Windows setup EXE)
- [ ] `SHA256SUMS.txt` cryptographic checksum manifest generated and uploaded
- [ ] GitHub Release title formatted as `RT-Library v${VERSION}`
- [ ] Release notes generated from tag changes and changelog
- [ ] No database files, cookies, or catalog data published
