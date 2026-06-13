/** Common camera RAW extensions developed through LibRaw (rawpy) on import. */
export const RAW_FILE_EXTENSIONS = [
  ".cr2", ".cr3", ".crw", ".nef", ".nrw", ".arw", ".srf", ".sr2", ".dng",
  ".raf", ".rw2", ".orf", ".srw", ".pef", ".rwl", ".dcr", ".kdc", ".mrw",
  ".3fr", ".fff", ".iiq", ".mef", ".mos", ".x3f", ".erf", ".gpr", ".raw"
] as const;

const RAW_EXTENSION_LIST = RAW_FILE_EXTENSIONS.join(",");

export const SUPPORTED_IMAGE_ACCEPT =
  `image/jpeg,image/png,image/webp,image/svg+xml,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.svg,.heic,.heif,${RAW_EXTENSION_LIST}`;

export const HEIC_CONVERSION_ERROR_MESSAGE =
  "לא הצלחנו להמיר את קובץ ה-HEIC הזה. נסה להמיר אותו ל-JPG/PNG או להשתמש בקובץ אחר.";

export const RAW_CONVERSION_ERROR_MESSAGE =
  "לא הצלחנו לפענח את קובץ ה-RAW הזה. נסה להמיר אותו ל-JPG/PNG או להשתמש בקובץ אחר.";

export const RAW_UNSUPPORTED_MESSAGE =
  "תמיכה בקבצי RAW זמינה רק בגרסת הדסקטופ של SPP2.";

export const RAW_INSTALL_CANCELLED_MESSAGE =
  "התקנת התמיכה ב-RAW בוטלה. הקובץ לא נטען.";

export function isRawFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return RAW_FILE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  return (
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    type === "image/heic" ||
    type === "image/heif"
  );
}

export function isSupportedIncomingImageFile(file: File): boolean {
  const type = file.type.toLowerCase();
  return (
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "image/webp" ||
    type === "image/svg+xml" ||
    isHeicFile(file) ||
    isRawFile(file) ||
    /\.(jpe?g|png|webp|svg)$/i.test(file.name)
  );
}

async function normalizeRawImage(file: File): Promise<File> {
  const api = typeof window !== "undefined" ? window.spp?.raw : undefined;
  if (api === undefined || typeof api.decode !== "function") {
    throw new Error(RAW_UNSUPPORTED_MESSAGE);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await api.decode(bytes, file.name);

  if (result === undefined || result === null || result.ok !== true || result.bytes === undefined) {
    if (result && result.cancelled === true) {
      throw new Error(RAW_INSTALL_CANCELLED_MESSAGE);
    }
    throw new Error((result && result.error) || RAW_CONVERSION_ERROR_MESSAGE);
  }

  const isJpeg = String(result.format ?? "JPEG").toUpperCase() === "JPEG";
  const newExt = isJpeg ? ".jpg" : ".png";
  const newType = isJpeg ? "image/jpeg" : "image/png";
  const newName = /\.[^./\\]+$/.test(file.name)
    ? file.name.replace(/\.[^./\\]+$/, newExt)
    : `${file.name}${newExt}`;

  const blob = new Blob([new Uint8Array(result.bytes)], { type: newType });
  return new File([blob], newName, {
    type: newType,
    lastModified: file.lastModified
  });
}

export async function normalizeIncomingImage(file: File): Promise<File> {
  if (isRawFile(file)) {
    return normalizeRawImage(file);
  }
  if (!isHeicFile(file)) {
    return file;
  }

  const { default: heic2any } = await import("heic2any");
  const convertedBlob = await heic2any({
    blob: file,
    toType: "image/png",
    quality: 0.95
  });

  const blob = Array.isArray(convertedBlob)
    ? convertedBlob[0]
    : convertedBlob;

  const newName = /\.(heic|heif)$/i.test(file.name)
    ? file.name.replace(/\.(heic|heif)$/i, ".png")
    : `${file.name}.png`;

  return new File([blob], newName, {
    type: "image/png",
    lastModified: file.lastModified
  });
}

export async function normalizeIncomingImages(
  files: File[]
): Promise<{ files: File[]; failed: File[]; message?: string }> {
  const normalized: File[] = [];
  const failed: File[] = [];
  let message: string | undefined;

  for (const file of files) {
    try {
      normalized.push(await normalizeIncomingImage(file));
    } catch (err) {
      failed.push(file);
      if (message === undefined) {
        message = err instanceof Error && err.message
          ? err.message
          : isRawFile(file)
            ? RAW_CONVERSION_ERROR_MESSAGE
            : HEIC_CONVERSION_ERROR_MESSAGE;
      }
    }
  }

  return { files: normalized, failed, message };
}
