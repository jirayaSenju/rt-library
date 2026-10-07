import { FileEntry, FileStat } from "./types";

function getFSAPI() {
  if (window.rtLibrary?.filesystem) return window.rtLibrary.filesystem;
  const api = (window as any).electronAPI;
  if (api) {
    return {
      readDir: api.readDir ? (p: string) => api.readDir(p) : api.filesystem?.readDir,
      readFile: api.readFile ? (p: string) => api.readFile(p) : api.filesystem?.readFile,
      readBinaryFile: api.filesystem?.readBinaryFile,
      statFile: api.statFile ? (p: string) => api.statFile(p) : api.filesystem?.statFile,
      exists: api.filesystem?.exists,
      mkdir: api.filesystem?.mkdir,
    };
  }
  return null;
}

export async function readDir(dirPath: string): Promise<FileEntry[]> {
  const fs = getFSAPI();
  if (fs?.readDir) {
    try {
      return await fs.readDir(dirPath);
    } catch (e) {
      console.warn(`readDir error for path ${dirPath}:`, e);
    }
  }
  return [];
}

export async function readFile(filePath: string): Promise<string> {
  const fs = getFSAPI();
  if (fs?.readFile) {
    return await fs.readFile(filePath);
  }
  throw new Error(`Platform readFile unavailable for ${filePath}`);
}

export async function readBinaryFile(filePath: string): Promise<Uint8Array | null> {
  const fs = getFSAPI();
  if (fs?.readBinaryFile) {
    return await fs.readBinaryFile(filePath);
  }
  return null;
}

export async function statFile(filePath: string): Promise<FileStat | null> {
  const fs = getFSAPI();
  if (fs?.statFile) {
    try {
      return await fs.statFile(filePath);
    } catch (e) {
      return null;
    }
  }
  return null;
}

export async function exists(filePath: string): Promise<boolean> {
  const fs = getFSAPI();
  if (fs?.exists) {
    try {
      return await fs.exists(filePath);
    } catch (e) {
      return false;
    }
  }
  return false;
}

export async function mkdir(dirPath: string): Promise<boolean> {
  const fs = getFSAPI();
  if (fs?.mkdir) {
    try {
      return await fs.mkdir(dirPath);
    } catch (e) {
      return false;
    }
  }
  return false;
}
