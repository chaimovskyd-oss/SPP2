export interface MagicWandRequest {
  imageData: ImageData;
  clickX: number;
  clickY: number;
  tolerance: number;
  contiguous: boolean;
}

export interface MagicWandResponse {
  mask: Uint8Array;
  width: number;
  height: number;
}

function colorDiff(
  data: Uint8ClampedArray,
  idx: number,
  r: number,
  g: number,
  b: number
): number {
  const dr = data[idx] - r;
  const dg = data[idx + 1] - g;
  const db = data[idx + 2] - b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function runMagicWand(req: MagicWandRequest): MagicWandResponse {
  const { imageData, clickX, clickY, tolerance, contiguous } = req;
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);

  const cx = Math.round(clickX);
  const cy = Math.round(clickY);
  if (cx < 0 || cx >= width || cy < 0 || cy >= height) {
    return { mask, width, height };
  }

  const seedIdx = (cy * width + cx) * 4;
  const seedR = data[seedIdx];
  const seedG = data[seedIdx + 1];
  const seedB = data[seedIdx + 2];

  if (contiguous) {
    // Flood fill (BFS)
    const queue: number[] = [cy * width + cx];
    mask[cy * width + cx] = 1;

    while (queue.length > 0) {
      const pos = queue.shift()!;
      const py = Math.floor(pos / width);
      const px = pos % width;

      for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const npos = ny * width + nx;
        if (mask[npos] !== 0) continue;
        const nidx = npos * 4;
        if (colorDiff(data, nidx, seedR, seedG, seedB) <= tolerance) {
          mask[npos] = 1;
          queue.push(npos);
        }
      }
    }
  } else {
    // Select all matching pixels globally
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      if (colorDiff(data, idx, seedR, seedG, seedB) <= tolerance) {
        mask[i] = 1;
      }
    }
  }

  // Convert binary mask to 0/255
  const result = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    result[i] = mask[i] === 1 ? 255 : 0;
  }
  return { mask: result, width, height };
}

// Worker message handler
self.onmessage = (event: MessageEvent<MagicWandRequest>) => {
  const response = runMagicWand(event.data);
  (self as unknown as Worker).postMessage(response, { transfer: [response.mask.buffer] });
};
