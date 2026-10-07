export async function selectFolder(): Promise<string | null> {
  if (window.rtLibrary?.dialogs?.selectFolder) {
    try {
      return await window.rtLibrary.dialogs.selectFolder();
    } catch (e) {
      console.warn("Desktop selectFolder error:", e);
    }
  }
  const api = (window as any).electronAPI;
  if (api?.selectFolder) {
    try {
      return await api.selectFolder();
    } catch (e) {
      console.warn("Desktop selectFolder error:", e);
    }
  }
  return null;
}
