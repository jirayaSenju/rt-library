# Data Storage & File Locations

All application data, catalogs, settings, and cache directories are stored locally on your system using standard platform user data paths.

---

## Default Storage Paths

| Operating System | Storage Path |
| :--- | :--- |
| **Linux** | `~/.config/rt-library/` |
| **Windows** | `%APPDATA%\rt-library\` (e.g. `C:\Users\<username>\AppData\Roaming\rt-library\`) |
| **macOS** | `~/Library/Application Support/rt-library/` |

---

## Directory Structure

```
<userData>/
├── rt-library-v2.sqlite        # Primary SQLite database
├── rt-library-v2.sqlite-wal    # Write-Ahead Log (active runtime transactions)
├── rt-library-v2.sqlite-shm    # Shared memory index (active runtime only)
├── backups/                    # Automatic & manual database backup snapshots
├── image-cache/                # Locally cached covers and screenshots
├── scraper-categories.json     # User category configurations & custom overrides
└── config.json                 # UI preferences, themes, and application settings
```

---

## Custom Storage Locations

You can override the storage path by setting the `RT_LIBRARY_USER_DATA_DIR` environment variable before launching the application:

```bash
export RT_LIBRARY_USER_DATA_DIR="/path/to/custom/storage"
./RT-Library-*.AppImage
```

---

## Uninstallation & Cleanup

Uninstalling the application binary does not automatically delete your local SQLite database or image cache to prevent accidental data loss. To perform a complete purge of all local data:

- **Linux**: Remove `~/.config/rt-library/` and `~/.cache/rt-library/`
- **Windows**: Delete `%APPDATA%\rt-library\` and `%LOCALAPPDATA%\rt-library\`
- **macOS**: Delete `~/Library/Application Support/rt-library/`
