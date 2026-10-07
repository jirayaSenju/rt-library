function getSystemAPI() {
  if (window.rtLibrary?.system) return window.rtLibrary.system;
  const api = (window as any).electronAPI;
  if (api) {
    return {
      getConfigDir: api.getConfigDir || api.system?.getConfigDir,
      loadAppConfig: api.loadAppConfig || api.system?.loadAppConfig,
      saveAppConfig: api.saveAppConfig || api.system?.saveAppConfig,
      loadSqliteDb: api.loadSqliteDb || api.system?.loadSqliteDb,
      saveSqliteDb: api.saveSqliteDb || api.system?.saveSqliteDb,
    };
  }
  return null;
}

export async function getConfigDir(): Promise<string> {
  const sys = getSystemAPI();
  if (sys?.getConfigDir) {
    try {
      const dir = await sys.getConfigDir();
      if (dir) return dir;
    } catch (e) {
      console.warn("getConfigDir error:", e);
    }
  }
  return "rt-library-appdata";
}

export async function loadAppConfig(): Promise<Record<string, any> | null> {
  const sys = getSystemAPI();
  if (sys?.loadAppConfig) {
    try {
      return await sys.loadAppConfig();
    } catch (e) {
      console.warn("loadAppConfig error:", e);
    }
  }
  return null;
}

export async function saveAppConfig(configData: Record<string, any>): Promise<boolean> {
  const sys = getSystemAPI();
  if (sys?.saveAppConfig) {
    try {
      return await sys.saveAppConfig(configData);
    } catch (e) {
      console.warn("saveAppConfig error:", e);
    }
  }
  return false;
}

export async function loadSqliteDb(): Promise<Uint8Array | null> {
  const sys = getSystemAPI();
  if (sys?.loadSqliteDb) {
    try {
      const raw = await sys.loadSqliteDb();
      if (!raw) return null;

      if (raw instanceof Uint8Array && raw.length > 0) {
        return raw;
      }

      if ((raw as any).type === "Buffer" && Array.isArray((raw as any).data) && (raw as any).data.length > 0) {
        return new Uint8Array((raw as any).data);
      }

      if ((raw as any).buffer instanceof ArrayBuffer) {
        return new Uint8Array((raw as any).buffer, (raw as any).byteOffset || 0, (raw as any).byteLength || (raw as any).length);
      }

      if (Array.isArray(raw) && raw.length > 0) {
        return new Uint8Array(raw);
      }

      if (typeof raw === "object" && Object.keys(raw).length > 0) {
        const values = Object.values(raw).filter((v): v is number => typeof v === "number");
        if (values.length > 0) {
          return new Uint8Array(values);
        }
      }
    } catch (e) {
      console.warn("loadSqliteDb error:", e);
    }
  }
  return null;
}

export async function saveSqliteDb(data: Uint8Array): Promise<boolean> {
  const sys = getSystemAPI();
  if (sys?.saveSqliteDb) {
    try {
      return await sys.saveSqliteDb(data);
    } catch (e) {
      console.warn("saveSqliteDb error:", e);
    }
  }
  return false;
}
