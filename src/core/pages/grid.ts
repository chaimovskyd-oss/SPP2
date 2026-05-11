import { createPage } from "../document/factory";
import { createFrameLayer } from "../layers/factory";
import type { Page } from "@/types/document";
import type { FitMode, Margins, Size } from "@/types/primitives";

export interface GridTemplate {
  pageSize: Size;
  margins: Margins;
  rows?: number;
  columns?: number;
  cellSize?: Size;
  spacing: number;
  fillMode: "byRowsColumns" | "byCellSize" | "autoFitCount";
  fitMode: FitMode;
  autoCreatePages: boolean;
}

export interface GenerateGridPagesInput {
  assetIds: string[];
  template: GridTemplate;
  linkedGroupId: string;
}

export function generateGridPages(input: GenerateGridPagesInput): Page[] {
  const rows = input.template.rows ?? 1;
  const columns = input.template.columns ?? 1;
  const perPage = rows * columns;
  const pageCount = input.template.autoCreatePages
    ? Math.max(1, Math.ceil(input.assetIds.length / perPage))
    : 1;

  return Array.from({ length: pageCount }).map((_, pageIndex) => {
    const page = createPage({
      name: `Grid ${pageIndex + 1}`,
      setup: {
        size: input.template.pageSize,
        margins: input.template.margins
      }
    });
    const availableWidth = page.width - input.template.margins.left - input.template.margins.right;
    const availableHeight = page.height - input.template.margins.top - input.template.margins.bottom;
    const cellWidth = (availableWidth - input.template.spacing * (columns - 1)) / columns;
    const cellHeight = (availableHeight - input.template.spacing * (rows - 1)) / rows;

    const layers = Array.from({ length: perPage }).map((_, index) => {
      const globalIndex = pageIndex * perPage + index;
      const column = index % columns;
      const row = Math.floor(index / columns);
      return createFrameLayer({
        name: `Grid cell ${globalIndex + 1}`,
        rect: {
          x: input.template.margins.left + column * (cellWidth + input.template.spacing),
          y: input.template.margins.top + row * (cellHeight + input.template.spacing),
          width: cellWidth,
          height: cellHeight
        },
        contentType: input.assetIds[globalIndex] ? "image" : "empty",
        imageAssetId: input.assetIds[globalIndex],
        fitMode: input.template.fitMode,
        linkedGroup: input.linkedGroupId,
        batchIndex: globalIndex,
        zIndex: index
      });
    });

    return {
      ...page,
      layers
    };
  });
}
