/** Opens an image in ColorLab and watches for saves, then fires onUpdated with a base64 string. */
export async function openInColorLab(
  colorLabPath: string,
  imageDataUrl: string,
  ext: string,
  onUpdated: (base64: string) => void
): Promise<{ watchId: string; tempPath: string; error?: string }> {
  if (!window.spp) return { watchId: "", tempPath: "", error: "Not running in Electron" };
  if (!colorLabPath) return { watchId: "", tempPath: "", error: "ColorLab path not configured" };

  const tempPath = await window.spp.writeTempImage(imageDataUrl, ext);
  const watchId = `cl_${Date.now()}`;

  const { error: watchError } = await window.spp.watchFile(watchId, tempPath);
  if (watchError) return { watchId, tempPath, error: watchError };

  const unsubscribe = window.spp.onFileChanged(async (id, filePath) => {
    if (id !== watchId) return;
    try {
      const base64 = await window.spp.readFileBase64(filePath);
      onUpdated(base64);
    } catch {
      // ignore
    }
  });

  const { error: openError } = await window.spp.openExternalApp(colorLabPath, tempPath);
  if (openError) {
    unsubscribe();
    await window.spp.unwatchFile(watchId);
    return { watchId, tempPath, error: openError };
  }

  return { watchId, tempPath };
}

export async function stopColorLabWatch(watchId: string): Promise<void> {
  if (!window.spp) return;
  await window.spp.unwatchFile(watchId);
}
