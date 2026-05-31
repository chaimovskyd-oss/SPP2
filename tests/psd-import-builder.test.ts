import { describe, expect, it } from "vitest";
import { buildDocumentFromPsdManifest, type PsdImportManifest } from "@/services/psdImport";

function manifest(): PsdImportManifest {
  return {
    type: "psd-import",
    sourcePath: "C:\\designs\\ברכה.psd",
    canvas: { width: 800, height: 600 },
    warnings: ['Skipped "Text": layer could not be rendered.'],
    layers: [
      {
        id: "bottom",
        name: "Background",
        groupPath: [],
        pngPath: "bottom.png",
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        opacity: 1,
        visible: false,
        warnings: ["hidden test"]
      },
      {
        id: "top",
        name: "כותרת",
        groupPath: ["קבוצה"],
        pngPath: "top.png",
        x: 50,
        y: 40,
        width: 300,
        height: 120,
        opacity: 0.75,
        visible: true,
        warnings: [],
        text: {
          kind: "text",
          text: "שלום",
          fontNames: ["Noto Sans Hebrew"],
          fontSize: 48,
          color: "#112233",
          warnings: []
        }
      }
    ]
  };
}

describe("PSD import document builder", () => {
  it("creates a free-mode document with PSD canvas dimensions and image layers", async () => {
    const result = await buildDocumentFromPsdManifest(manifest(), async (path) => `base64-${path}`);

    expect(result.document.metadata.mode).toBe("free");
    expect(result.document.pages).toHaveLength(1);
    expect(result.document.pages[0]?.width).toBe(800);
    expect(result.document.pages[0]?.height).toBe(600);
    expect(result.document.assets).toHaveLength(2);
    expect(result.document.pages[0]?.layers).toHaveLength(2);
  });

  it("preserves layer geometry, opacity, visibility, group path metadata, and visual order", async () => {
    const result = await buildDocumentFromPsdManifest(manifest(), async (path) => `base64-${path}`);
    const [bottomLayer, topLayer] = result.document.pages[0]!.layers;

    expect(bottomLayer?.name).toBe("Background");
    expect(bottomLayer?.visible).toBe(false);
    expect(bottomLayer?.zIndex).toBe(0);

    expect(topLayer?.name).toBe("קבוצה / כותרת");
    expect(topLayer?.x).toBe(50);
    expect(topLayer?.y).toBe(40);
    expect(topLayer?.width).toBe(300);
    expect(topLayer?.height).toBe(120);
    expect(topLayer?.opacity).toBe(0.75);
    expect(topLayer?.zIndex).toBe(1);
    expect(topLayer?.metadata.groupPath).toEqual(["קבוצה"]);
    expect(topLayer?.metadata.psdText).toMatchObject({
      text: "שלום",
      fontNames: ["Noto Sans Hebrew"],
      fontSize: 48,
      color: "#112233"
    });
  });

  it("summarizes imported, skipped, and warning counts", async () => {
    const result = await buildDocumentFromPsdManifest(manifest(), async (path) => `base64-${path}`);

    expect(result.summary.importedLayers).toBe(2);
    expect(result.summary.skippedLayers).toBe(1);
    expect(result.summary.warnings).toContain('Skipped "Text": layer could not be rendered.');
    expect(result.summary.warnings).toContain("Background: hidden test");
  });

  it("maps PSD adjustment layers without reading a raster PNG", async () => {
    const psdManifest = manifest();
    psdManifest.layers.splice(1, 0, {
      id: "adj-brightness",
      name: "Brightness/Contrast 1",
      groupPath: [],
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      opacity: 0.5,
      visible: true,
      blendMode: "normal",
      clipping: true,
      warnings: [],
      adjustment: {
        kind: "adjustment",
        psdAdjustmentType: "BrightnessContrast",
        supported: true,
        operation: { type: "brightnessContrast", brightness: 18, contrast: -6 },
        warnings: []
      }
    });
    const readPaths: string[] = [];

    const result = await buildDocumentFromPsdManifest(psdManifest, async (path) => {
      readPaths.push(path);
      return `base64-${path}`;
    });
    const adjustment = result.document.pages[0]?.layers[1];

    expect(readPaths).toEqual(["bottom.png", "top.png"]);
    expect(adjustment?.type).toBe("adjustment-layer");
    if (adjustment?.type !== "adjustment-layer") throw new Error("wrong layer type");
    expect(adjustment.targetMode).toBe("clipped-to-layer");
    expect(adjustment.opacity).toBe(0.5);
    expect(adjustment.adjustments).toEqual([{ type: "brightnessContrast", brightness: 18, contrast: -6 }]);
  });
});
