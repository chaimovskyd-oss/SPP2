import { callFalApi, toFalImageUrl, imageUrlToDataUrl } from "./falAiService";
import { FAL_MODELS, type TopazModelId } from "./falModels.config";

interface ImageOutput {
  image: { url: string };
}

export async function runUpscale(
  imageDataUrl: string,
  topazModel: TopazModelId,
  scale: 2 | 4,
  quality: boolean,
  onProgress: (pct: number) => void,
  signal: AbortSignal
): Promise<string> {
  const imageUrl = await toFalImageUrl(imageDataUrl, signal);
  onProgress(10);

  if (quality) {
    const result = await callFalApi<
      {
        image_url: string;
        model: TopazModelId;
        upscale_factor: number;
        output_format: "png";
      },
      ImageOutput
    >(
      FAL_MODELS.upscale.quality,
      {
        image_url: imageUrl,
        model: topazModel,
        upscale_factor: scale,
        output_format: "png",
      },
      (pct) => onProgress(10 + Math.round(pct * 0.90)),
      signal
    );
    onProgress(100);
    return imageUrlToDataUrl(result.image.url, signal);
  }

  const result = await callFalApi<
    {
      image_url: string;
      scale: number;
      model: "RealESRGAN_x2plus" | "RealESRGAN_x4plus";
      output_format: "png";
    },
    ImageOutput
  >(
    FAL_MODELS.upscale.fast,
    {
      image_url: imageUrl,
      scale,
      model: scale === 2 ? "RealESRGAN_x2plus" : "RealESRGAN_x4plus",
      output_format: "png",
    },
    (pct) => onProgress(10 + Math.round(pct * 0.90)),
    signal
  );
  onProgress(100);
  return imageUrlToDataUrl(result.image.url, signal);
}
