import { describe, expect, it } from "vitest";
import {
  createClassPhotoModeDocument,
  createClassPhotoPersonRecord,
  defaultChildFrameStyle,
  defaultLayoutSettings,
  defaultStaffFrameStyle,
  defaultVisualBalanceSettings
} from "@/core/classPhoto/classPhotoFactory";
import { syncClassPhotoToPage } from "@/core/classPhoto/classPhotoLayoutEngine";
import { getPagePreset, pageSetupFromPreset } from "@/core/pageSetup/presets";
import type { ClassPhotoPersonRecord } from "@/types/classPhoto";
import type { VisualLayer } from "@/types/layers";

describe("Class Photo layout utilization", () => {
  it("uses a dense A4 portrait grid for 20 children with staff", () => {
    const { page, rule } = buildSyncedClassPhoto("portrait", 20, 2);
    const childFrames = peopleLayers(page.layers, "classPhotoFrame", "child");
    const people = page.layers.filter((layer) => layer.metadata?.["classPhotoFrame"] || layer.metadata?.["classPhotoName"]);
    const childRows = uniqueRounded(childFrames.map((layer) => layer.y));
    const contentBand = getContentBand(page.height, rule.layoutSettings);

    expect(childFrames).toHaveLength(20);
    expect(childRows.length).toBeGreaterThan(2);
    expect(rule.metadata["classPhotoAutoLayout"]).toMatchObject({ childColumns: 5 });
    expect(allInsideBand(people, contentBand.top, contentBand.bottom)).toBe(true);
    expect(hasOverlaps(people)).toBe(false);
    expect((rule.metadata["classPhotoAutoLayout"] as { utilizationScore: number }).utilizationScore).toBeGreaterThan(0.6);
  });

  it("keeps A4 landscape people content inside title/footer bands", () => {
    const { page, rule, overflows } = buildSyncedClassPhoto("landscape", 20, 2);
    const people = page.layers.filter((layer) => layer.metadata?.["classPhotoFrame"] || layer.metadata?.["classPhotoName"]);
    const childFrames = peopleLayers(page.layers, "classPhotoFrame", "child");
    const contentBand = getContentBand(page.height, rule.layoutSettings);

    expect(overflows).toBe(false);
    expect(uniqueRounded(childFrames.map((layer) => layer.y)).length).toBeGreaterThan(2);
    expect(allInsideBand(people, contentBand.top, contentBand.bottom)).toBe(true);
    expect(hasOverlaps(people)).toBe(false);
  });

  it.each([
    { children: 17, staff: 0 },
    { children: 20, staff: 1 },
    { children: 23, staff: 4 }
  ])("fits uneven class counts: $children children, $staff staff", ({ children, staff }) => {
    const { page, rule, overflows } = buildSyncedClassPhoto("portrait", children, staff);
    const people = page.layers.filter((layer) => layer.metadata?.["classPhotoFrame"] || layer.metadata?.["classPhotoName"]);
    const contentBand = getContentBand(page.height, rule.layoutSettings);

    expect(overflows).toBe(false);
    expect(peopleLayers(page.layers, "classPhotoFrame", "child")).toHaveLength(children);
    expect(peopleLayers(page.layers, "classPhotoFrame", "staff")).toHaveLength(staff);
    expect(allInsideBand(people, contentBand.top, contentBand.bottom)).toBe(true);
    expect(hasOverlaps(people)).toBe(false);
  });

  it("promotes edited person image params from frames and restores them on regenerate", () => {
    const { page, rule } = buildSyncedClassPhoto("portrait", 2, 1);
    const targetRecord = rule.personRecords.find((record) => record.role === "child");
    const targetFrame = page.layers.find((layer) => layer.type === "frame" && layer.id === targetRecord?.frameLayerId);
    expect(targetRecord).toBeDefined();
    expect(targetFrame?.type).toBe("frame");

    const editedPage = {
      ...page,
      layers: page.layers.map((layer) => layer.id === targetFrame?.id
        ? {
            ...layer,
            metadata: {
              ...layer.metadata,
              imageEditParams: { brightness: 1.3, contrast: -0.8 }
            }
          }
        : layer)
    };

    const regenerated = syncClassPhotoToPage(editedPage, rule);
    const record = regenerated.rule.personRecords.find((person) => person.id === targetRecord?.id);
    const frame = regenerated.page.layers.find((layer) => layer.type === "frame" && layer.id === record?.frameLayerId);

    expect(record?.imageEditParams).toMatchObject({ brightness: 1.3, contrast: -0.8 });
    expect(frame?.type === "frame" ? frame.metadata.imageEditParams : undefined).toMatchObject({ brightness: 1.3, contrast: -0.8 });
  });

  it("restores child name visual style on regenerate", () => {
    const { page, rule } = buildSyncedClassPhoto("portrait", 2, 0);
    const styledRule = {
      ...rule,
      metadata: {
        ...rule.metadata,
        childNameTextVisualStyle: {
          stroke: { version: 1, color: "#ffffff", width: 4, opacity: 1 },
          shadow: { version: 1, color: "#000000", blur: 6, offsetX: 0, offsetY: 2, opacity: 0.3 }
        }
      }
    };

    const regenerated = syncClassPhotoToPage(page, styledRule);
    const childNames = peopleLayers(regenerated.page.layers, "classPhotoName", "child");

    expect(childNames).toHaveLength(2);
    expect(childNames.every((layer) => layer.type === "text" && layer.stroke?.color === "#ffffff" && layer.shadow?.blur === 6)).toBe(true);
  });
});

function buildSyncedClassPhoto(orientation: "portrait" | "landscape", childCount: number, staffCount: number) {
  const setup = pageSetupFromPreset(getPagePreset("a4"), orientation);
  const people = makePeople(childCount, staffCount);
  const layoutSettings = defaultLayoutSettings(setup.size.width, setup.size.height, childCount, staffCount);
  const doc = createClassPhotoModeDocument(
    "Class photo test",
    setup,
    [],
    people,
    "Class Photo",
    "Footer",
    layoutSettings,
    defaultVisualBalanceSettings(),
    defaultChildFrameStyle(),
    defaultStaffFrameStyle()
  );
  const rule = doc.classPhotoRules[0];
  const page = doc.pages[0];
  if (!rule || !page) throw new Error("Missing class photo rule or page");
  const result = syncClassPhotoToPage(page, rule);
  return result;
}

function makePeople(childCount: number, staffCount: number): ClassPhotoPersonRecord[] {
  const staff = Array.from({ length: staffCount }, (_, index) =>
    createClassPhotoPersonRecord(`staff-asset-${index}`, `staff_${index + 1}.jpg`, "staff", index)
  );
  const children = Array.from({ length: childCount }, (_, index) =>
    createClassPhotoPersonRecord(`child-asset-${index}`, `child_${index + 1}.jpg`, "child", staffCount + index)
  );
  return [...staff, ...children];
}

function peopleLayers(layers: VisualLayer[], metadataKey: "classPhotoFrame" | "classPhotoName", role: "child" | "staff") {
  return layers.filter((layer) => {
    const meta = layer.metadata?.[metadataKey] as { role?: string } | undefined;
    return meta?.role === role;
  });
}

function getContentBand(pageH: number, s: ReturnType<typeof defaultLayoutSettings>) {
  return {
    top: s.margins.top + s.topTitleAreaHeight + s.titleToContentSpacing,
    bottom: pageH - s.margins.bottom - s.bottomFooterAreaHeight - s.contentToFooterSpacing
  };
}

function allInsideBand(layers: VisualLayer[], top: number, bottom: number): boolean {
  return layers.every((layer) => layer.y >= top - 0.01 && layer.y + layer.height <= bottom + 0.01);
}

function hasOverlaps(layers: VisualLayer[]): boolean {
  for (let i = 0; i < layers.length; i++) {
    for (let j = i + 1; j < layers.length; j++) {
      if (rectsOverlap(layers[i], layers[j])) return true;
    }
  }
  return false;
}

function rectsOverlap(a: VisualLayer, b: VisualLayer): boolean {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
}

function uniqueRounded(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value)))];
}
