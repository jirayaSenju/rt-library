import { toast } from "sonner";
import { platform } from "../platform";

export async function openMagnetLink(magnetUrl?: string, title?: string): Promise<boolean> {
  if (!magnetUrl || !magnetUrl.startsWith("magnet:")) {
    toast.error("Link Magnet inválido ou indisponível.");
    return false;
  }

  try {
    const success = await platform.shell.openMagnet(magnetUrl, title);
    if (success) {
      toast.success(`Opening "${title || "Magnet"}" in Torrent Client...`);
      return true;
    }
  } catch (err: any) {
    console.error("❌ Erro ao abrir magnet link:", err);
    toast.error(`Falha ao abrir magnet: ${err.message}`);
    return false;
  }
  return false;
}

export async function openFolderDialog(): Promise<string | null> {
  try {
    const selected = await platform.dialogs.selectFolder();
    if (selected) {
      return selected;
    }
  } catch (err) {
    console.warn("Desktop folder dialog error:", err);
  }

  const path = window.prompt(
    "Enter the absolute path to your JSON catalog directory:",
    "/home/user/rt-library/data"
  );
  return path ? path.trim() : null;
}
