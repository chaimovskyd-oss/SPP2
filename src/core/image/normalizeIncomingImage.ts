export const SUPPORTED_IMAGE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/svg+xml,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.svg,.heic,.heif";

export const HEIC_CONVERSION_ERROR_MESSAGE =
  "לא הצלחנו להמיר את קובץ ה-HEIC הזה. נסה להמיר אותו ל-JPG/PNG או להשתמש בקובץ אחר.";

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
    /\.(jpe?g|png|webp|svg)$/i.test(file.name)
  );
}

export async function normalizeIncomingImage(file: File): Promise<File> {
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

export async function normalizeIncomingImages(files: File[]): Promise<{ files: File[]; failed: File[] }> {
  const normalized: File[] = [];
  const failed: File[] = [];

  for (const file of files) {
    try {
      normalized.push(await normalizeIncomingImage(file));
    } catch {
      failed.push(file);
    }
  }

  return { files: normalized, failed };
}
