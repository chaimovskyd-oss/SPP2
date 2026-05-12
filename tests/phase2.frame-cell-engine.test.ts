import { describe, expect, it } from "vitest";
import { createProjectEnvelope, parseProject, serializeProject } from "@/core";
import { createFrameLayer, createImageLayer } from "@/core/layers/factory";
import { computeContentRect, resetContentTransform } from "@/core/rendering/frameFitEngine";
import { checkOverlap, validateFrameMove, computeGridLayout } from "@/core/layout/layoutEngine";
import { applyLinkedGroupPatch, withMemberOverride, removeLinkedGroupMember } from "@/core/layers/linkedGroups";
import { createLinkedGroup } from "@/core/layers/factory";
import { createFreeModeDocument } from "@/ui/projectActions";
import type { FrameLayer } from "@/types/layers";

// ─── עזרי בדיקה ──────────────────────────────────────────────────────────────

function makeFrame(id: string, x: number, y: number, w = 200, h = 200): FrameLayer {
  return createFrameLayer({
    id,
    name: `פריים ${id}`,
    rect: { x, y, width: w, height: h },
    behaviorMode: "layoutLocked"
  });
}

// ─── ImageLayer vs FrameLayer — הפרדה נכונה ─────────────────────────────────

describe("הפרדת ImageLayer מ-FrameLayer", () => {
  it("createImageLayer יוצר type=image ללא שדות פריים", () => {
    const layer = createImageLayer({ assetId: "a1", rect: { x: 0, y: 0, width: 100, height: 100 } });
    expect(layer.type).toBe("image");
    expect("behaviorMode" in layer).toBe(false);
    expect("contentTransform" in layer).toBe(false);
    expect("imageAssetId" in layer).toBe(false);
    expect(layer.assetId).toBe("a1");
  });

  it("createFrameLayer יוצר type=frame עם behaviorMode ו-contentTransform", () => {
    const frame = makeFrame("f1", 0, 0);
    expect(frame.type).toBe("frame");
    expect(frame.behaviorMode).toBe("layoutLocked");
    expect(frame.contentTransform).toEqual({ version: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 });
  });

  it("ImageLayer ו-FrameLayer שומרים ונטענים בנפרד", () => {
    const doc = createFreeModeDocument("sep-test");
    const page = doc.pages[0]!;
    const imageLayer = createImageLayer({ assetId: "img1", rect: { x: 10, y: 20, width: 300, height: 200 } });
    const frameLayer = makeFrame("fr1", 400, 0);
    const project = { ...doc, pages: [{ ...page, layers: [imageLayer, frameLayer] }] };

    const envelope = createProjectEnvelope({ document: project, linkedGroups: [], batchJobs: [] });
    const parsed = parseProject(serializeProject(envelope));
    const layers = parsed.document.pages[0]!.layers;

    expect(layers[0]?.type).toBe("image");
    expect(layers[1]?.type).toBe("frame");
  });
});

// ─── frameFitEngine — חישובי גיאומטריה ──────────────────────────────────────

describe("frameFitEngine", () => {
  const transform = resetContentTransform();

  it("fit — תמונה רחבה: מותאמת לפי רוחב", () => {
    const rect = computeContentRect(200, 200, 400, 200, "fit", transform);
    expect(rect.width).toBe(200);
    expect(rect.height).toBe(100);
    expect(rect.y).toBeCloseTo(50);
  });

  it("fill — תמונה ריבועית בפריים ריבועי: מכסה בדיוק", () => {
    const rect = computeContentRect(200, 200, 400, 400, "fill", transform);
    expect(rect.width).toBe(200);
    expect(rect.height).toBe(200);
  });

  it("fill — תמונה צרה: מוגדלת לכסות רוחב הפריים (חיתוך בגובה)", () => {
    // תמונה 100×400 (imgRatio=0.25), פריים 200×200 (innerRatio=1)
    // imgRatio < innerRatio → baseScale = frameW/imgW = 200/100 = 2
    // renderH = 400*2 = 800 — חיתוך אנכי; renderW = 100*2 = 200
    const rect = computeContentRect(200, 200, 100, 400, "fill", transform);
    expect(rect.width).toBeCloseTo(200);
    expect(rect.height).toBeCloseTo(800);
  });

  it("stretch — תמונה תמיד שווה לפריים", () => {
    const rect = computeContentRect(200, 300, 1000, 50, "stretch", transform);
    expect(rect.width).toBe(200);
    expect(rect.height).toBe(300);
  });

  it("padding מוחסר משטח התוכן", () => {
    const rect = computeContentRect(200, 200, 200, 200, "fill", transform, 10);
    expect(rect.x).toBeCloseTo(10);
    expect(rect.y).toBeCloseTo(10);
    expect(rect.width).toBeCloseTo(180);
    expect(rect.height).toBeCloseTo(180);
  });

  it("contentTransform.scale מגדיל את התמונה", () => {
    const zoomedTransform = { ...transform, scale: 2 };
    const base = computeContentRect(200, 200, 200, 200, "fill", transform);
    const zoomed = computeContentRect(200, 200, 200, 200, "fill", zoomedTransform);
    expect(zoomed.width).toBeGreaterThan(base.width);
  });

  it("contentTransform.offsetX מזיז את התמונה אופקית", () => {
    const shifted = { ...transform, offsetX: 30 };
    const base = computeContentRect(200, 200, 200, 200, "fill", transform);
    const moved = computeContentRect(200, 200, 200, 200, "fill", shifted);
    expect(moved.x - base.x).toBeCloseTo(30);
  });
});

// ─── layoutEngine — חפיפה והגבלות ───────────────────────────────────────────

describe("layoutEngine", () => {
  it("checkOverlap מזהה חפיפה", () => {
    const a = makeFrame("a", 0, 0, 200, 200);
    const b = makeFrame("b", 100, 100, 200, 200);
    const result = checkOverlap(a, 0, 0, [a, b]);
    expect(result.hasOverlap).toBe(true);
    expect(result.overlappingIds).toContain("b");
  });

  it("checkOverlap מחזיר false כשאין חפיפה", () => {
    const a = makeFrame("a", 0, 0, 200, 200);
    const b = makeFrame("b", 300, 0, 200, 200);
    const result = checkOverlap(a, 0, 0, [a, b]);
    expect(result.hasOverlap).toBe(false);
  });

  it("validateFrameMove חוסם layoutLocked שלא במצב עריכה", () => {
    const frame = makeFrame("f", 0, 0);
    const result = validateFrameMove(frame, 100, 0, [frame], false);
    expect(result.allowed).toBe(false);
  });

  it("validateFrameMove מתיר layoutLocked במצב עריכה", () => {
    const frame = makeFrame("f", 0, 0);
    const b = makeFrame("b", 400, 0);
    const result = validateFrameMove(frame, 100, 0, [frame, b], true);
    expect(result.allowed).toBe(true);
  });

  it("validateFrameMove חוסם חפיפה ב-semiFlexible", () => {
    const a = { ...makeFrame("a", 0, 0), behaviorMode: "semiFlexible" as const };
    const b = makeFrame("b", 100, 0);
    const result = validateFrameMove(a, 50, 0, [a, b], false);
    expect(result.allowed).toBe(false);
  });

  it("freeform מאפשר הזזה חופשית", () => {
    const frame = { ...makeFrame("f", 0, 0), behaviorMode: "freeform" as const };
    const b = makeFrame("b", 50, 0);
    const result = validateFrameMove(frame, 0, 0, [frame, b], false);
    expect(result.allowed).toBe(true);
  });

  it("computeGridLayout מחזיר מיקומים נכונים לגריד 2×2", () => {
    const cells = computeGridLayout({ columns: 2, rows: 2, frameWidth: 100, frameHeight: 100, gapX: 10, gapY: 10, originX: 0, originY: 0 });
    expect(cells).toHaveLength(4);
    expect(cells[0]).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(cells[1]).toEqual({ x: 110, y: 0, width: 100, height: 100 });
    expect(cells[2]).toEqual({ x: 0, y: 110, width: 100, height: 100 });
    expect(cells[3]).toEqual({ x: 110, y: 110, width: 100, height: 100 });
  });
});

// ─── LinkedGroup — הפצת שינויים ועקיפות ─────────────────────────────────────

describe("linkedGroupEngine", () => {
  it("applyLinkedGroupPatch מחיל שינוי על כל חברי הקבוצה", () => {
    const f1 = makeFrame("f1", 0, 0, 100, 100);
    const f2 = makeFrame("f2", 200, 0, 100, 100);
    const group = createLinkedGroup({ name: "גודל", type: "size", memberIds: ["f1", "f2"] });

    const updated = applyLinkedGroupPatch([f1, f2], group, { width: 150, height: 150 });
    expect((updated[0] as FrameLayer).width).toBe(150);
    expect((updated[1] as FrameLayer).width).toBe(150);
  });

  it("withMemberOverride שומר override לחבר בודד", () => {
    const group = createLinkedGroup({ name: "סגנון", type: "style", memberIds: ["f1", "f2"], overridable: true });
    const withOverride = withMemberOverride(group, "f1", { width: 88 } as Partial<FrameLayer>);
    expect(withOverride.perMemberOverrides["f1"]?.width).toBe(88);
    expect(withOverride.perMemberOverrides["f2"]).toBeUndefined();
  });

  it("applyLinkedGroupPatch מכבד override של חבר", () => {
    const f1 = makeFrame("f1", 0, 0, 100, 100);
    const f2 = makeFrame("f2", 200, 0, 100, 100);
    const group = createLinkedGroup({ name: "סגנון", type: "size", memberIds: ["f1", "f2"], overridable: true });
    const withOverride = withMemberOverride(group, "f1", { width: 999 });

    const updated = applyLinkedGroupPatch([f1, f2], withOverride, { width: 150 });
    expect((updated[0] as FrameLayer).width).toBe(999);
    expect((updated[1] as FrameLayer).width).toBe(150);
  });

  it("removeLinkedGroupMember מסיר חבר ואת ה-override שלו", () => {
    const group = createLinkedGroup({ name: "גודל", type: "size", memberIds: ["f1", "f2"] });
    const withOverride = withMemberOverride(group, "f1", { width: 4 } as Partial<FrameLayer>);
    const removed = removeLinkedGroupMember(withOverride, "f1");
    expect(removed.memberIds).not.toContain("f1");
    expect(removed.memberIds).toContain("f2");
    expect(removed.perMemberOverrides["f1"]).toBeUndefined();
  });
});
