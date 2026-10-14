const os = require('os');
const path = require('path');

function getApplicationDataDirectory(env = process.env, platform = process.platform, home = os.homedir()) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  if (env.RT_LIBRARY_USER_DATA_DIR) return pathApi.resolve(env.RT_LIBRARY_USER_DATA_DIR);
  if (platform === 'win32') return pathApi.join(env.APPDATA || pathApi.join(home, 'AppData', 'Roaming'), 'rt-library');
  if (platform === 'darwin') return pathApi.join(home, 'Library', 'Application Support', 'rt-library');
  return pathApi.join(env.XDG_CONFIG_HOME || pathApi.join(home, '.config'), 'rt-library');
}

function getScraperProfileDirectory(env = process.env, platform = process.platform, home = os.homedir()) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  return env.SCRAPER_PROFILE_DIR
    ? pathApi.resolve(env.SCRAPER_PROFILE_DIR)
    : pathApi.join(getApplicationDataDirectory(env, platform, home), 'scraper-profile');
}

function resolveScraperProfileDirectory(userDataPath, platform = null) {
  if (typeof userDataPath !== 'string' || !userDataPath.trim()) {
    throw new Error('SCRAPER_PROFILE_PATH_INVALID: Electron userData path is required.');
  }
  const effectivePlatform = platform || (userDataPath.startsWith('/') ? 'linux' : process.platform);
  const pathApi = effectivePlatform === 'win32' ? path.win32 : path.posix;
  return pathApi.resolve(userDataPath, 'scraper-profile');
}

function getScraperProfileDir(userDataDir = null, env = process.env, platform = process.platform, home = os.homedir()) {
  const fs = require('fs');
  const profileDir = userDataDir
    ? resolveScraperProfileDirectory(userDataDir, platform)
    : getScraperProfileDirectory(env, platform, home);
  if (!fs.existsSync(profileDir)) {
    try {
      fs.mkdirSync(profileDir, { recursive: true });
    } catch (_) {}
  }
  return profileDir;
}

module.exports = {
  getApplicationDataDirectory,
  getScraperProfileDirectory,
  resolveScraperProfileDirectory,
  getScraperProfileDir,
};
