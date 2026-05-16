export type PrintRangeMode = "current" | "all" | "custom";

export interface PageRangeParseResult {
  indices: number[]; // zero-based page indices, sorted, deduplicated
  error?: string;
}

/**
 * Parse a user-entered page range string into zero-based page indices.
 * Supports: "1", "1-4", "2,5,8", "1-3,6,10-12"
 */
export function parsePageRange(input: string, totalPages: number): PageRangeParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { indices: [], error: "טווח העמודים ריק." };
  }

  const segments = trimmed.split(",");
  const indexSet = new Set<number>();

  for (const seg of segments) {
    const part = seg.trim();
    if (!part) {
      return { indices: [], error: "טווח העמודים שהוזן אינו תקין." };
    }

    const rangeMatch = /^(\d+)-(\d+)$/.exec(part);
    const singleMatch = /^(\d+)$/.exec(part);

    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start < 1) {
        return { indices: [], error: `מספר עמוד לא תקין: ${start}. העמודים מתחילים מ-1.` };
      }
      if (start > end) {
        return { indices: [], error: `טווח לא תקין: ${start}-${end}. המספר הראשון חייב להיות קטן מהשני.` };
      }
      if (end > totalPages) {
        return { indices: [], error: `עמוד ${end} לא קיים. קיימים בפרויקט ${totalPages} עמודים.` };
      }
      for (let i = start; i <= end; i++) {
        indexSet.add(i - 1);
      }
    } else if (singleMatch) {
      const page = parseInt(singleMatch[1], 10);
      if (page < 1) {
        return { indices: [], error: `מספר עמוד לא תקין: ${page}. העמודים מתחילים מ-1.` };
      }
      if (page > totalPages) {
        return { indices: [], error: `עמוד ${page} לא קיים. קיימים בפרויקט ${totalPages} עמודים.` };
      }
      indexSet.add(page - 1);
    } else {
      return { indices: [], error: `טווח העמודים שהוזן אינו תקין: "${part}".` };
    }
  }

  if (indexSet.size === 0) {
    return { indices: [], error: "לא נמצאו עמודים בטווח שהוזן." };
  }

  return { indices: Array.from(indexSet).sort((a, b) => a - b) };
}

/**
 * Returns zero-based page indices to print based on mode.
 * Returns an error string if the custom range is invalid.
 */
export function getPagesForPrint(
  mode: PrintRangeMode,
  customRange: string | undefined,
  totalPages: number,
  currentPageIndex: number
): number[] | { error: string } {
  if (totalPages <= 0) return { error: "לא נמצאו עמודים בפרויקט." };

  switch (mode) {
    case "current":
      return [Math.max(0, Math.min(currentPageIndex, totalPages - 1))];
    case "all":
      return Array.from({ length: totalPages }, (_, i) => i);
    case "custom": {
      const result = parsePageRange(customRange ?? "", totalPages);
      if (result.error) return { error: result.error };
      return result.indices;
    }
  }
}
