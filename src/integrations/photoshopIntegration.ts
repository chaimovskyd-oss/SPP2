/** Opens an image in Photoshop and watches for saves, then fires onUpdated with a base64 PNG. */
export async function openInPhotoshop(
  photoshopPath: string,
  imageDataUrl: string,
  ext: string,
  onUpdated: (base64: string) => void
): Promise<{ watchId: string; tempPath: string; error?: string }> {
  if (!window.spp) return { watchId: "", tempPath: "", error: "Not running in Electron" };
  if (!photoshopPath) return { watchId: "", tempPath: "", error: "Photoshop path not configured" };

  const tempPath = await window.spp.writeTempImage(imageDataUrl, ext);
  const watchId = `ps_${Date.now()}`;

  const { error: watchError } = await window.spp.watchFile(watchId, tempPath);
  if (watchError) return { watchId, tempPath, error: watchError };

  const unsubscribe = window.spp.onFileChanged(async (id, filePath) => {
    if (id !== watchId) return;
    try {
      const base64 = await window.spp.readFileBase64(filePath);
      onUpdated(base64);
    } catch {
      // File may still be writing; ignore transient errors
    }
  });

  const { error: openError } = await window.spp.openExternalApp(photoshopPath, tempPath);
  if (openError) {
    unsubscribe();
    await window.spp.unwatchFile(watchId);
    return { watchId, tempPath, error: openError };
  }

  // Return watchId so caller can stop watching when done
  return { watchId, tempPath };
}

export async function stopPhotoshopWatch(watchId: string): Promise<void> {
  if (!window.spp) return;
  await window.spp.unwatchFile(watchId);
}
