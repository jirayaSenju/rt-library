# Update troubleshooting

RT-Library writes updater diagnostics to `logs/updater.log` inside Electron's application user data directory. On Windows, open `%APPDATA%\rt-library\logs\updater.log` in File Explorer.

The log is created when the updater starts and records version/platform details, update checks, update availability, download progress milestones, and error messages with stack traces. Share this file when reporting an update failure.
