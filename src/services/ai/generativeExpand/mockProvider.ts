import type { GenerativeExpandProvider } from "./types";

/** Echoes the input image back. Used to validate render/mask/commit/undo without a model. */
export const mockProvider: GenerativeExpandProvider = {
  id: "mock",
  async isAvailable() {
    return true;
  },
  async generateExpand(req, onProgress) {
    onProgress(10);
    await new Promise((resolve) => setTimeout(resolve, 300));
    onProgress(100);
    return { resultDataUrl: req.inputImageDataUrl, modelId: "mock" };
  },
};
