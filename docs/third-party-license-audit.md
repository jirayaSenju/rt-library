# Third-Party Dependencies & Packaged Components License Audit

> **Audit Date**: 2026-10-07  
> **Audited Targets**: Production Runtime Dependencies (`dependencies` in `package.json`) & Packaged Platform Components  
> **Source Audit Status**: ✅ PASS (All packages resolved to permissive open-source licenses)  
> **Packaged Components Status**: ✅ PASS (Electron, Chromium, Node.js, better-sqlite3 native binary, Playwright verified)

This document records the comprehensive two-tier license audit performed on the direct production runtime dependencies and redistributable platform binaries included in the RT-Library desktop application.

---

## 1. Audit Summary

| Category | Count | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Direct Production NPM Dependencies** | 31 | ✅ PASS | All direct runtime packages |
| **Packaged Platform Components** | 5 | ✅ PASS | Electron, Chromium, Node.js, native SQLite, Playwright |
| **Permissive Licenses (MIT / Apache-2.0 / ISC / BSD)** | 36 | ✅ PASS | Full notices bundled in `THIRD_PARTY_LICENSES.txt` |
| **Strong Copyleft (GPL / AGPL)** | 0 | ✅ None | Zero viral copyleft runtime deps |
| **Weak Copyleft (LGPL / MPL)** | 0 | ✅ None | Zero weak copyleft runtime deps |
| **Unknown / Unlicensed** | 0 | ✅ None | All licenses verified from package metadata & license files |

---

## 2. Source Dependency Audit (NPM Production Dependencies)

| Package | Installed Version | License | License Source | Status | Upstream Repository |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `@radix-ui/react-accordion` | `1.2.20` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-alert-dialog` | `1.1.23` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-aspect-ratio` | `1.1.15` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-avatar` | `1.2.6` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-checkbox` | `1.3.11` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-context-menu` | `2.3.7` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-dialog` | `1.1.23` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-dropdown-menu` | `2.1.24` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-label` | `2.1.15` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-popover` | `1.1.23` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-progress` | `1.1.16` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-select` | `2.3.7` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-separator` | `1.1.15` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-slot` | `1.3.3` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-switch` | `1.3.7` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-tabs` | `1.1.21` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@radix-ui/react-tooltip` | `1.2.16` | MIT | `LICENSE` | NOTICE_REQUIRED | `radix-ui/primitives` |
| `@tanstack/react-virtual` | `3.14.13` | MIT | `LICENSE` | NOTICE_REQUIRED | `TanStack/virtual` |
| `better-sqlite3` | `11.10.0` | MIT | `LICENSE` | NOTICE_REQUIRED | `WiseLibs/better-sqlite3` |
| `class-variance-authority` | `0.7.1` | Apache-2.0 | `LICENSE` | NOTICE_REQUIRED | `joe-bell/cva` |
| `clsx` | `2.1.1` | MIT | `license` | NOTICE_REQUIRED | `lukeed/clsx` |
| `cmdk` | `1.1.1` | MIT | `LICENSE.md` | NOTICE_REQUIRED | `pacocoursey/cmdk` |
| `framer-motion` | `11.18.2` | MIT | `LICENSE.md` | NOTICE_REQUIRED | `motiondivision/motion` |
| `lucide-react` | `0.439.0` | ISC | `LICENSE` | NOTICE_REQUIRED | `lucide-icons/lucide` |
| `playwright` | `1.63.0` | Apache-2.0 | `LICENSE` & `NOTICE` | NOTICE_REQUIRED | `microsoft/playwright` |
| `react` | `18.3.1` | MIT | `LICENSE` | NOTICE_REQUIRED | `facebook/react` |
| `react-dom` | `18.3.1` | MIT | `LICENSE` | NOTICE_REQUIRED | `facebook/react` |
| `react-window` | `1.8.11` | MIT | `LICENSE.md` | NOTICE_REQUIRED | `bvaughn/react-window` |
| `sonner` | `1.7.4` | MIT | `LICENSE.md` | NOTICE_REQUIRED | `emilkowalski/sonner` |
| `tailwind-merge` | `2.6.1` | MIT | `LICENSE.md` | NOTICE_REQUIRED | `dcastilho/tailwind-merge` |
| `tailwindcss-animate` | `1.0.7` | MIT | `LICENSE` | NOTICE_REQUIRED | `jamiebuilds/tailwindcss-animate` |

---

## 3. Packaged & Redistributed Component Audit

| Component | Distributed Version | License | Redistribution Mechanism | Notice Inclusion | Upstream Project |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Electron Framework** | `31.0.0` | MIT | Desktop Binary Runtime Host | `THIRD_PARTY_LICENSES.txt` | `https://github.com/electron/electron` |
| **Chromium Engine** | `~126.x` | BSD-3-Clause / Permissive | Embedded inside Electron binary | `LICENSES.chromium.html` (Electron bundle) | `https://chromium.googlesource.com/` |
| **Node.js Runtime** | `~20.14.x` | MIT | Embedded inside Electron Main | `THIRD_PARTY_LICENSES.txt` | `https://github.com/nodejs/node` |
| **better-sqlite3 Native Addon** | `11.10.0` | MIT / SQLite Blessing | Native binary in `app.asar.unpacked` | `THIRD_PARTY_LICENSES.txt` | `https://github.com/WiseLibs/better-sqlite3` |
| **Playwright Automation Library** | `1.63.0` | Apache-2.0 | Scraper module inside `app.asar` | `THIRD_PARTY_LICENSES.txt` (includes NOTICE) | `https://github.com/microsoft/playwright` |
| **Playwright Browser Binaries** | Dynamic / External | Open Source | **Not bundled** (Downloaded to user cache on request) | N/A (Not redistributed in packages) | `https://playwright.dev` |

---

## 4. Consolidated Legal Notices

All applicable copyright notices, Apache 2.0 notices, and license texts are consolidated in the top-level artifact:
- [THIRD_PARTY_LICENSES.txt](../THIRD_PARTY_LICENSES.txt)

This file is bundled directly into all Linux (`AppImage`, `.deb`) and Windows (`NSIS`) distributable packages.
