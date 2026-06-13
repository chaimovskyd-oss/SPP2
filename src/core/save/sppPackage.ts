import type { Asset } from "@/types/document";
import type { ProjectEnvelope } from "@/types/project";
import { parseProject, serializeProject } from "./projectFormat";

export interface PortableAssetPayload {
  assetId: string;
  original?: Uint8Array;
  preview?: Uint8Array;
  thumbnail?: Uint8Array;
}

export interface PortableProjectPackage {
  project: ProjectEnvelope;
  metadata: Record<string, unknown>;
  assets: PortableAssetPayload[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function createPortableSppPackage(input: PortableProjectPackage): Promise<Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set("project.json", encoder.encode(serializeProject(input.project)));
  files.set("metadata.json", encoder.encode(JSON.stringify(input.metadata, null, 2)));
  input.assets.forEach((asset) => {
    if (asset.original !== undefined) files.set(`assets/originals/${asset.assetId}`, asset.original);
    if (asset.preview !== undefined) files.set(`assets/previews/${asset.assetId}`, asset.preview);
    if (asset.thumbnail !== undefined) files.set(`assets/thumbnails/${asset.assetId}`, asset.thumbnail);
  });
  files.set("recovery/README.txt", encoder.encode("SPP recovery data will be written here in future package saves."));
  return createZipStore(files);
}

export function readPortableSppPackage(bytes: Uint8Array): PortableProjectPackage {
  const files = readZipStore(bytes);
  const projectFile = files.get("project.json");
  if (projectFile === undefined) {
    throw new Error("SPP package missing project.json");
  }
  const metadataFile = files.get("metadata.json");
  const assetsById = new Map<string, PortableAssetPayload>();
  files.forEach((content, path) => {
    const match = path.match(/^assets\/(originals|previews|thumbnails)\/(.+)$/);
    if (match === null) {
      return;
    }
    const [, bucket, assetId] = match;
    const asset = assetsById.get(assetId) ?? { assetId };
    if (bucket === "originals") asset.original = content;
    if (bucket === "previews") asset.preview = content;
    if (bucket === "thumbnails") asset.thumbnail = content;
    assetsById.set(assetId, asset);
  });
  return {
    project: parseProject(decoder.decode(projectFile)),
    metadata: metadataFile === undefined ? {} : JSON.parse(decoder.decode(metadataFile)) as Record<string, unknown>,
    assets: [...assetsById.values()]
  };
}

export function validatePortableAssetCoverage(project: ProjectEnvelope, payloads: PortableAssetPayload[]): { missingOriginals: Asset[]; missingPreviews: Asset[] } {
  const payloadById = new Map(payloads.map((payload) => [payload.assetId, payload]));
  return {
    missingOriginals: project.document.assets.filter((asset) => asset.kind === "image" && payloadById.get(asset.id)?.original === undefined),
    missingPreviews: project.document.assets.filter((asset) => asset.kind === "image" && payloadById.get(asset.id)?.preview === undefined)
  };
}

export function createZipStore(files: Map<string, Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  files.forEach((content, name) => {
    const nameBytes = encoder.encode(name);
    const crc = crc32(content);
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, content.length, true);
    view.setUint32(22, content.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, content);

    const header = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(header.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, content.length, true);
    centralView.setUint32(24, content.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    header.set(nameBytes, 46);
    central.push(header);
    offset += local.length + content.length;
  });
  const centralOffset = offset;
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.size, true);
  endView.setUint16(10, files.size, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  return concatBytes([...chunks, ...central, end]);
}

function readZipStore(bytes: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    const signature = view.getUint32(0, true);
    if (signature !== 0x04034b50) {
      break;
    }
    const method = view.getUint16(8, true);
    if (method !== 0) {
      throw new Error("Only stored SPP zip entries are supported");
    }
    const size = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    files.set(name, bytes.slice(contentStart, contentStart + size));
    offset = contentStart + size;
  }
  return files;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
