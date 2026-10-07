export async function openExternal(url: string): Promise<boolean> {
  if (window.rtLibrary?.shell?.openExternal) {
    try {
      return await window.rtLibrary.shell.openExternal(url);
    } catch (e) {
      console.warn("openExternal error:", e);
    }
  }
  window.open(url, "_blank");
  return true;
}

export async function openMagnet(magnetUrl: string, title?: string): Promise<boolean> {
  if (window.rtLibrary?.shell?.openMagnet) {
    try {
      return await window.rtLibrary.shell.openMagnet(magnetUrl, title);
    } catch (e) {
      console.warn("openMagnet error:", e);
    }
  }
  window.open(magnetUrl, "_blank");
  return true;
}
