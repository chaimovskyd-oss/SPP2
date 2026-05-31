import { callFalApi, toFalImageUrl, imageUrlToDataUrl } from "./falAiService";
import { FAL_MODELS } from "./falModels.config";

interface BriaEraseOutput {
  image: { url: string };
}

interface FillOutput {
  images: Array<{ url: string }>;
}

const DEFAULT_FILL_PROMPT = "Natural clean background matching the surrounding image";

export async function runObjectRemove(
  imageDataUrl: string,
  maskDataUrl: string,
  prompt: string,
  useCreative: boolean,
  onProgress: (pct: number) => void,
  signal: AbortSignal
): Promise<string> {
  const [imageUrl, maskUrl] = await Promise.all([
    toFalImageUrl(imageDataUrl, signal),
    toFalImageUrl(maskDataUrl, signal),
  ]);

  onProgress(10);

  const eraseResult = await callFalApi<
    { image_url: string; mask_url: string; mask_type: "manual"; preserve_alpha: boolean },
    BriaEraseOutput
  >(
    FAL_MODELS.erase.default,
    {
      image_url: imageUrl,
      mask_url: maskUrl,
      mask_type: "manual",
      preserve_alpha: true,
    },
    (pct) => onProgress(10 + Math.round(pct * 0.45)),
    signal
  );

  onProgress(55);

  const fillPrompt = prompt.trim() || (useCreative ? DEFAULT_FILL_PROMPT : "");
  if (!fillPrompt) {
    onProgress(100);
    return imageUrlToDataUrl(eraseResult.image.url, signal);
  }

  const fillResult = await callFalApi<
    { image_url: string; mask_url: string; prompt: string; num_images: 1; output_format?: "png" },
    FillOutput
  >(
    useCreative ? FAL_MODELS.fill.creative : FAL_MODELS.fill.default,
    {
      image_url: eraseResult.image.url,
      mask_url: maskUrl,
      prompt: fillPrompt,
      num_images: 1,
      ...(useCreative ? { output_format: "png" as const } : {}),
    },
    (pct) => onProgress(55 + Math.round(pct * 0.40)),
    signal
  );

  onProgress(100);
  const outputUrl = fillResult.images?.[0]?.url;
  if (!outputUrl) throw new Error("FAL_FILL_NO_OUTPUT");
  return imageUrlToDataUrl(outputUrl, signal);
}
