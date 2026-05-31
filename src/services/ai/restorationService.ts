import { callFalApi, toFalImageUrl, imageUrlToDataUrl } from "./falAiService";
import { FAL_MODELS } from "./falModels.config";

interface ImageOutput {
  image: { url: string };
}

export type RestorationMode = "topaz-recovery" | "real-esrgan";

export async function runRestoration(
  imageDataUrl: string,
  mode: RestorationMode,
  onProgress: (pct: number) => void,
  signal: AbortSignal
): Promise<string> {
  const imageUrl = await toFalImageUrl(imageDataUrl, signal);
  onProgress(10);

  if (mode === "topaz-recovery") {
    const result = await callFalApi<
      {
        image_url: string;
        model: "Recovery V2";
        upscale_factor: number;
        output_format: "png";
        subject_detection: "All";
        face_enhancement: boolean;
      },
      ImageOutput
    >(
      FAL_MODELS.restore.quality,
      {
        image_url: imageUrl,
        model: "Recovery V2",
        upscale_factor: 2,
        output_format: "png",
        subject_detection: "All",
        face_enhancement: true,
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
      model: "RealESRGAN_x2plus";
      output_format: "png";
      face: boolean;
    },
    ImageOutput
  >(
    FAL_MODELS.restore.fast,
    {
      image_url: imageUrl,
      scale: 2,
      model: "RealESRGAN_x2plus",
      output_format: "png",
      face: true,
    },
    (pct) => onProgress(10 + Math.round(pct * 0.90)),
    signal
  );
  onProgress(100);
  return imageUrlToDataUrl(result.image.url, signal);
}
