# Security Policy

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `1.x.x` | ✅ Yes |
| `< 1.0.0` | ❌ No |

---

## Reporting a Vulnerability

If you discover a security vulnerability within RT-Library:

1. **Do not disclose vulnerabilities publicly** through public issue trackers, forums, or social media.
2. Please report the issue privately using **GitHub Security Advisories** on the repository page (or contact the maintainers directly via repository security contacts).
3. Include detailed steps to reproduce the issue, along with relevant environment details (operating system, Node.js version, application package format).

---

## Scope & Privacy Guidelines

- RT-Library is a local desktop application. Security investigations typically focus on local file handling, Electron IPC privilege boundaries, and dependency integrity.
- **Do NOT submit**:
  - Real catalog SQLite databases (`*.sqlite`, `*.db`);
  - Scraper session files, browser profiles, or cookies (`cookies.json`, `storageState.json`);
  - Passwords, authentication credentials, or private keys;
  - Torrent files (`.torrent`), magnet link dumps, or copyrighted datasets.
- When providing reproduction material, use synthetic identifiers and sanitized mock data.
