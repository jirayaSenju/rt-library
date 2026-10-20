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

export async function openToolExternal(
  toolId: string,
  url?: string
): Promise<{ success: boolean; error?: string }> {
  if (window.rtLibrary?.tools?.openExternal) {
    try {
      const res = await window.rtLibrary.tools.openExternal({ toolId, url });
      if (res && typeof res.success === "boolean") {
        return res;
      }
      return { success: Boolean(res) };
    } catch (e: any) {
      console.warn("[TOOLS] openToolExternal bridge error:", e);
      return { success: false, error: e?.message || "OPEN_FAILED" };
    }
  }

  // Web / non-Electron fallback with client-side security checks
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") {
        return { success: false, error: "HTTPS_REQUIRED" };
      }
      const allowed = ["github.com", "edenprodkeys.com"];
      const isAllowed = allowed.some(
        (h) => parsed.hostname === h || parsed.hostname.endsWith("." + h)
      );
      if (!isAllowed) {
        return { success: false, error: "HOST_NOT_ALLOWED" };
      }
      window.open(url, "_blank", "noopener,noreferrer");
      return { success: true };
    } catch {
      return { success: false, error: "INVALID_URL" };
    }
  }

  return { success: false, error: "NO_BRIDGE" };
}

