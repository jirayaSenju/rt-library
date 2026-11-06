const { BrowserWindow: DefaultBrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Window IPC channels and window chrome management
 */
function registerWindowIPCHandlers(ipcMainInstance, BrowserWindowClass = DefaultBrowserWindow) {
  if (!ipcMainInstance || typeof ipcMainInstance.handle !== 'function') return;

  ipcMainInstance.handle('window:is-maximized', (event) => {
    try {
      const win = BrowserWindowClass.fromWebContents ? BrowserWindowClass.fromWebContents(event.sender) : null;
      return win ? win.isMaximized() : false;
    } catch {
      return false;
    }
  });

  ipcMainInstance.handle('window:minimize', (event) => {
    try {
      const win = BrowserWindowClass.fromWebContents ? BrowserWindowClass.fromWebContents(event.sender) : null;
      if (win && typeof win.minimize === 'function') {
        win.minimize();
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMainInstance.handle('window:toggle-maximize', (event) => {
    try {
      const win = BrowserWindowClass.fromWebContents ? BrowserWindowClass.fromWebContents(event.sender) : null;
      if (!win) return false;
      if (typeof win.isMaximized === 'function' && win.isMaximized()) {
        if (typeof win.unmaximize === 'function') win.unmaximize();
      } else {
        if (typeof win.maximize === 'function') win.maximize();
      }
      return typeof win.isMaximized === 'function' ? win.isMaximized() : false;
    } catch {
      return false;
    }
  });

  ipcMainInstance.handle('window:close', (event) => {
    try {
      const win = BrowserWindowClass.fromWebContents ? BrowserWindowClass.fromWebContents(event.sender) : null;
      if (win && typeof win.close === 'function') {
        win.close();
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMainInstance.handle('window:set-icon', (event, iconName) => {
    try {
      const win = BrowserWindowClass.fromWebContents ? BrowserWindowClass.fromWebContents(event.sender) : null;
      if (!win || typeof win.setIcon !== 'function') return false;

      const safeName = typeof iconName === 'string' ? path.basename(iconName) : 'app-icon.png';
      const candidates = [
        path.join(__dirname, '..', '..', 'public', safeName),
        path.join(__dirname, '..', 'public', safeName),
        path.join(__dirname, '..', '..', 'dist', safeName),
        path.join(__dirname, '..', 'dist', safeName),
        path.join(process.resourcesPath || '', safeName),
        path.join(process.resourcesPath || '', 'build', 'icons', safeName),
      ];

      const found = candidates.find((p) => {
        try {
          return fs.existsSync(p);
        } catch (_) {
          return false;
        }
      });

      if (found) {
        if (nativeImage && typeof nativeImage.createFromPath === 'function') {
          try {
            const img = nativeImage.createFromPath(found);
            if (!img.isEmpty()) {
              win.setIcon(img);
              return true;
            }
          } catch (_) {}
        }
        win.setIcon(found);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  });
}

/**
 * Attaches maximize/unmaximize listeners to synchronize state with renderer
 */
function attachWindowStateListeners(win) {
  if (!win || typeof win.on !== 'function') return;

  win.on('maximize', () => {
    try {
      if (win.webContents && !win.isDestroyed()) {
        win.webContents.send('window:maximized-change', true);
      }
    } catch (_) {}
  });

  win.on('unmaximize', () => {
    try {
      if (win.webContents && !win.isDestroyed()) {
        win.webContents.send('window:maximized-change', false);
      }
    } catch (_) {}
  });
}

module.exports = {
  registerWindowIPCHandlers,
  attachWindowStateListeners,
};

