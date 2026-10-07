import { AppSettings } from "../types";
import { platform } from "../platform";

class OSConfigService {
  private configDir: string | null = null;

  async getConfigDir(): Promise<string> {
    if (this.configDir) return this.configDir;

    const dir = await platform.system.getConfigDir();
    if (dir) {
      this.configDir = dir;
      return dir;
    }

    this.configDir = "os-appdata/rt-library";
    return this.configDir;
  }

  async loadConfig(): Promise<Partial<AppSettings> | null> {
    const config = await platform.system.loadAppConfig();
    if (config) return config;

    try {
      const path = localStorage.getItem("rt_library_path");
      if (path) {
        return { libraryPath: path };
      }
    } catch (e) {}

    return null;
  }

  async saveConfig(config: Partial<AppSettings>): Promise<void> {
    if (config.libraryPath) {
      try {
        localStorage.setItem("rt_library_path", config.libraryPath);
      } catch (e) {}
    }

    await platform.system.saveAppConfig(config);
  }

  async loadSqliteDatabase(): Promise<Uint8Array | null> {
    return await platform.system.loadSqliteDb();
  }

  async saveSqliteDatabase(blob: Uint8Array): Promise<void> {
    await platform.system.saveSqliteDb(blob);
  }
}

export const configService = new OSConfigService();
