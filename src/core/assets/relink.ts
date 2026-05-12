import type { Asset } from "@/types/document";

export interface RelinkCandidate {
  path: string;
  fileName: string;
  fileSize?: number;
  hash?: string;
}

export interface RelinkResult {
  asset: Asset;
  matched: boolean;
  reason: "hash" | "size-name" | "name" | "manual" | "none";
}

export function findMissingAssets(assets: Asset[]): Asset[] {
  return assets.filter((asset) => asset.status === "missing" || (asset.originalPath === undefined && asset.kind === "image"));
}

export function relinkAsset(asset: Asset, candidate: RelinkCandidate, reason: RelinkResult["reason"] = "manual"): RelinkResult {
  return {
    asset: {
      ...asset,
      status: "ready",
      originalPath: candidate.path,
      fileSize: candidate.fileSize ?? asset.fileSize,
      hash: candidate.hash ?? asset.hash,
      checksum: candidate.hash ?? asset.checksum,
      metadata: {
        ...asset.metadata,
        relinkedAt: new Date().toISOString(),
        relinkReason: reason
      }
    },
    matched: true,
    reason
  };
}

export function matchRelinkCandidate(asset: Asset, candidates: RelinkCandidate[]): RelinkResult {
  const byHash = candidates.find((candidate) => candidate.hash !== undefined && candidate.hash === (asset.hash ?? asset.checksum));
  if (byHash !== undefined) {
    return relinkAsset(asset, byHash, "hash");
  }
  const bySizeName = candidates.find((candidate) => candidate.fileName === asset.name && candidate.fileSize !== undefined && candidate.fileSize === asset.fileSize);
  if (bySizeName !== undefined) {
    return relinkAsset(asset, bySizeName, "size-name");
  }
  const byName = candidates.find((candidate) => candidate.fileName === asset.name);
  if (byName !== undefined) {
    return relinkAsset(asset, byName, "name");
  }
  return { asset, matched: false, reason: "none" };
}

export function relinkFolder(assets: Asset[], candidates: RelinkCandidate[]): { assets: Asset[]; matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const nextAssets = assets.map((asset) => {
    if (asset.status !== "missing") {
      return asset;
    }
    const result = matchRelinkCandidate(asset, candidates);
    if (result.matched) {
      matched.push(asset.id);
    }
    return result.asset;
  });
  return {
    assets: nextAssets,
    matched,
    missing: nextAssets.filter((asset) => asset.status === "missing").map((asset) => asset.id)
  };
}
