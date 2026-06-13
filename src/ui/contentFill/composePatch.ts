export function loadHtmlImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot load image"));
    image.src = source;
  });
}

/** Draw the inpaint ROI patch back over a base image, returning a PNG data URL. */
export async function composeInpaintPatch(
  baseCanvas: HTMLCanvasElement,
  patchPngBase64: string,
  roi: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const patch = await loadHtmlImage(`data:image/png;base64,${patchPngBase64}`);
  const canvas = window.document.createElement("canvas");
  canvas.width = baseCanvas.width;
  canvas.height = baseCanvas.height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Cannot compose fill result");
  context.drawImage(baseCanvas, 0, 0);
  context.drawImage(patch, roi.x, roi.y, roi.width, roi.height);
  return canvas.toDataURL("image/png");
}
