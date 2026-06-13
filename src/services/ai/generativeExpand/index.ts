import type {
  GenerativeExpandModel,
  GenerativeExpandProvider,
  GenerativeExpandRequest,
  GenerativeExpandResult,
} from "./types";
import { mockProvider } from "./mockProvider";
import { localSdFastProvider, localSdxlQualityProvider } from "./localSdProviders";
import { falExpandProvider } from "./falExpandProvider";

const PROVIDERS: Record<GenerativeExpandModel, GenerativeExpandProvider> = {
  mock: mockProvider,
  "local-sd-fast": localSdFastProvider,
  "local-sdxl-quality": localSdxlQualityProvider,
  "fal-ai-expand": falExpandProvider,
};

export function getExpandProvider(model: GenerativeExpandModel): GenerativeExpandProvider {
  return PROVIDERS[model];
}

export async function runGenerativeExpand(
  model: GenerativeExpandModel,
  req: GenerativeExpandRequest,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<GenerativeExpandResult> {
  const provider = PROVIDERS[model];
  if (provider === undefined) throw new Error(`GEN_EXPAND_UNKNOWN_MODEL:${model}`);
  return provider.generateExpand(req, onProgress, signal);
}

export * from "./types";
