import { describe, expect, it } from "vitest";
import { createDocument, createPage, createTextLayer } from "@/core";
import { generateBatchProduction } from "@/core/batchProduction/generateEngine";
import { setBatchProductionMeta } from "@/core/batchProduction/batchProductionMeta";
import { parseCsvImport, parseTextImportContent, parseTxtImport } from "@/core/batchProduction/textImportParser";
import type { BatchProductionDocMeta, BatchTextVariableField } from "@/types/batchProduction";

function textField(id: string, label: string, layerId = id): BatchTextVariableField {
  return {
    id,
    type: "text",
    layerId,
    label,
    sourceField: id,
    autoResize: true,
    minFontScale: 0.7,
  };
}

describe("batch production text-only imports", () => {
  it("parses TXT as one non-empty name per row into the primary text field", () => {
    const fields = [textField("name", "שם")];
    const rows = parseTxtImport("דנה\n\nיוסי\n  מיכל  ", fields);

    expect(rows.map((row) => row.fields.name)).toEqual(["דנה", "יוסי", "מיכל"]);
  });

  it("maps CSV headers to text fields by label", () => {
    const fields = [textField("name", "שם"), textField("class", "כיתה")];
    const rows = parseCsvImport("שם,כיתה\nדנה,א1\nיוסי,ב2", fields);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.fields).toEqual({ name: "דנה", class: "א1" });
    expect(rows[1]?.fields).toEqual({ name: "יוסי", class: "ב2" });
  });

  it("maps CSV without headers by field order", () => {
    const fields = [textField("name", "שם"), textField("class", "כיתה")];
    const rows = parseCsvImport("דנה,א1\nיוסי,ב2", fields);

    expect(rows.map((row) => row.fields)).toEqual([
      { name: "דנה", class: "א1" },
      { name: "יוסי", class: "ב2" },
    ]);
  });

  it("keeps missing CSV text fields empty and ignores extra columns", () => {
    const fields = [textField("name", "שם"), textField("class", "כיתה"), textField("teacher", "מורה")];
    const rows = parseCsvImport("דנה,א1,נועה,extra\nיוסי", fields);

    expect(rows[0]?.fields).toEqual({ name: "דנה", class: "א1", teacher: "נועה" });
    expect(rows[1]?.fields).toEqual({ name: "יוסי", class: "", teacher: "" });
  });

  it("keeps separate field values when multiple text boxes share the same field id", () => {
    const fields = [
      textField("name", "שם פרטי", "layer_first"),
      textField("name", "שם משפחה", "layer_last"),
    ];
    const rows = parseCsvImport("שם פרטי,שם משפחה\nדנה,לוי", fields);

    expect(rows[0]?.fields).toEqual({ layer_first: "דנה", layer_last: "לוי" });
  });

  it("parses quoted Hebrew CSV values that contain commas", () => {
    const fields = [textField("name", "שם"), textField("note", "הערה")];
    const rows = parseTextImportContent('שם,הערה\n"דנה, לוי","שלום, כיתה א"', "names.csv", fields);

    expect(rows[0]?.fields).toEqual({ name: "דנה, לוי", note: "שלום, כיתה א" });
  });

  it("generates text-only batch pages without importing new assets", () => {
    const nameLayer = createTextLayer({ text: "שם", rect: { x: 0, y: 0, width: 200, height: 60 } });
    const classLayer = createTextLayer({ text: "כיתה", rect: { x: 0, y: 70, width: 200, height: 60 } });
    const page = createPage({ name: "Template", layers: [nameLayer, classLayer] });
    const baseDoc = { ...createDocument({ name: "Text batch template" }), pages: [page], assets: [] };
    const meta: BatchProductionDocMeta = {
      isTemplate: true,
      templateId: "template_text_only",
      templateName: "Text Only",
      canvas: {
        widthPx: page.width,
        heightPx: page.height,
        dpi: baseDoc.dpi,
        unit: "px",
        orientation: "portrait",
        ratio: page.width / page.height,
      },
      variableFields: [
        textField("name", "שם", nameLayer.id),
        textField("class", "כיתה", classLayer.id),
      ],
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
    };
    const templateDoc = setBatchProductionMeta(baseDoc, meta);

    const generated = generateBatchProduction(
      templateDoc,
      meta,
      [
        { fields: { name: "דנה", class: "א1" } },
        { fields: { name: "יוסי", class: "ב2" } },
      ],
      [],
    );

    expect(generated.pages).toHaveLength(2);
    expect(generated.assets).toHaveLength(0);
    expect(generated.metadata.batchProduction).toBeUndefined();
    expect(generated.pages[0]?.layers.find((layer) => layer.type === "text" && layer.text === "דנה")).toBeDefined();
    expect(generated.pages[1]?.layers.find((layer) => layer.type === "text" && layer.text === "ב2")).toBeDefined();
  });

  it("generates distinct text values for duplicated variable field ids", () => {
    const firstNameLayer = createTextLayer({ text: "שם", rect: { x: 0, y: 0, width: 200, height: 60 } });
    const lastNameLayer = createTextLayer({ text: "משפחה", rect: { x: 0, y: 70, width: 200, height: 60 } });
    const page = createPage({ name: "Template", layers: [firstNameLayer, lastNameLayer] });
    const baseDoc = { ...createDocument({ name: "Duplicate id text batch" }), pages: [page], assets: [] };
    const meta: BatchProductionDocMeta = {
      isTemplate: true,
      templateId: "template_duplicate_text_ids",
      templateName: "Duplicate Text IDs",
      canvas: {
        widthPx: page.width,
        heightPx: page.height,
        dpi: baseDoc.dpi,
        unit: "px",
        orientation: "portrait",
        ratio: page.width / page.height,
      },
      variableFields: [
        textField("name", "שם פרטי", firstNameLayer.id),
        textField("name", "שם משפחה", lastNameLayer.id),
      ],
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
    };

    const generated = generateBatchProduction(
      setBatchProductionMeta(baseDoc, meta),
      meta,
      [{ fields: { [firstNameLayer.id]: "דנה", [lastNameLayer.id]: "לוי" } }],
      [],
    );

    expect(generated.pages[0]?.layers.find((layer) => layer.type === "text" && layer.text === "דנה")).toBeDefined();
    expect(generated.pages[0]?.layers.find((layer) => layer.type === "text" && layer.text === "לוי")).toBeDefined();
  });
});
