export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  downloadBlob(filename, new Blob([content], { type: mimeType }));
}

export function downloadBytes(filename: string, bytes: Uint8Array, mimeType: string): void {
  const copy = new Uint8Array(bytes);
  downloadBlob(filename, new Blob([copy.buffer], { type: mimeType }));
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(",");
  if (meta === undefined || data === undefined) {
    throw new Error("Invalid data URL");
  }
  const mimeType = meta.match(/data:(.*);base64/)?.[1] ?? "application/octet-stream";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  downloadBlob(filename, dataUrlToBlob(dataUrl));
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
