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
import { canApplyClassPhotoGroupScale } from "@/core/classPhoto/classPhotoLayoutEngine";
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
    expect((rule.metadata["classPhotoAutoLayout"] as { childColumns: number }).childColumns).toBeGreaterThanOrEqual(5);
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

  it("keeps all 16 children on canvas when there is no staff row", () => {
    const { page, overflows } = buildSyncedClassPhoto("landscape", 16, 0, "Class Photo", "");
    const childFrames = peopleLayers(page.layers, "classPhotoFrame", "child");
    const people = page.layers.filter((layer) => layer.metadata?.["classPhotoFrame"] || layer.metadata?.["classPhotoName"]);

    expect(overflows).toBe(false);
    expect(childFrames).toHaveLength(16);
    expect(people).toHaveLength(32);
    expect(allInsidePage(people, page.width, page.height)).toBe(true);
    expect(hasOverlaps(people)).toBe(false);
  });

  it("does not let long imported filenames collapse the image layout", () => {
    const people = makePeople(16, 0).map((person, index) => ({
      ...person,
      displayName: `WhatsApp Image at 24 09 2025 ${17 + index}.12.26.${40 + index}`
    }));
    const { page, rule, overflows } = buildSyncedClassPhotoWithPeople("landscape", people, "Class Photo", "");
    const childFrames = peopleLayers(page.layers, "classPhotoFrame", "child");
    const plan = rule.metadata["classPhotoAutoLayout"] as { childFrameSize: number; utilizationScore: number };

    expect(overflows).toBe(false);
    expect(childFrames).toHaveLength(16);
    expect(plan.childFrameSize).toBeGreaterThan(170);
    expect(plan.utilizationScore).toBeGreaterThan(0.35);
    expect(allInsidePage(childFrames, page.width, page.height)).toBe(true);
  });

  it("sanitizes extreme spacing so every person remains on canvas", () => {
    const { page, rule, overflows } = buildSyncedClassPhoto("portrait", 16, 0, "Class Photo", "", {
      horizontalSpacing: 900,
      verticalSpacing: 900,
      frameToNameSpacing: 240,
      staffToChildrenSpacing: 900
    });
    const childFrames = peopleLayers(page.layers, "classPhotoFrame", "child");
    const people = page.layers.filter((layer) => layer.metadata?.["classPhotoFrame"] || layer.metadata?.["classPhotoName"]);

    expect(overflows).toBe(false);
    expect(childFrames).toHaveLength(16);
    expect(rule.layoutSettings.horizontalSpacing).toBeLessThan(900);
    expect(allInsidePage(people, page.width, page.height)).toBe(true);
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

  it("omits empty title/footer layers and gives people the freed space", () => {
    const withTitles = buildSyncedClassPhoto("portrait", 20, 2, "Class Photo", "Footer");
    const { page, rule } = buildSyncedClassPhoto("portrait", 20, 2, "", "");
    const title = page.layers.find((layer) => layer.metadata?.["classPhotoTitle"]);
    const footer = page.layers.find((layer) => layer.metadata?.["classPhotoFooter"]);
    const people = page.layers.filter((layer) => layer.metadata?.["classPhotoFrame"] || layer.metadata?.["classPhotoName"]);
    const withTitlesPlan = withTitles.rule.metadata["classPhotoAutoLayout"] as { childFrameSize: number };
    const emptyTitlePlan = rule.metadata["classPhotoAutoLayout"] as { childFrameSize: number };

    expect(title).toBeUndefined();
    expect(footer).toBeUndefined();
    expect(rule.titleTextLayerId).toBeUndefined();
    expect(rule.footerTextLayerId).toBeUndefined();
    expect(emptyTitlePlan.childFrameSize).toBeGreaterThan(withTitlesPlan.childFrameSize);
    expect(allInsideBand(people, rule.layoutSettings.margins.top, page.height - rule.layoutSettings.margins.bottom)).toBe(true);
  });

  it("applies group scaling while keeping each name aligned to its frame", () => {
    const { page, overflows } = buildSyncedClassPhoto("portrait", 18, 2, "Class Photo", "Footer", {
      childGroupScale: 1.15,
      staffGroupScale: 1.2
    });

    expect(overflows).toBe(false);
    for (const frame of peopleLayers(page.layers, "classPhotoFrame", "child")) {
      const meta = frame.metadata.classPhotoFrame as { personId: string };
      const name = page.layers.find((layer) => (layer.metadata?.classPhotoName as { personId?: string } | undefined)?.personId === meta.personId);
      expect(name?.x).toBe(frame.x);
      expect(name?.width).toBe(frame.width);
    }
    for (const frame of peopleLayers(page.layers, "classPhotoFrame", "staff")) {
      const meta = frame.metadata.classPhotoFrame as { personId: string };
      const name = page.layers.find((layer) => (layer.metadata?.classPhotoName as { personId?: string } | undefined)?.personId === meta.personId);
      expect(name?.x).toBe(frame.x);
      expect(name?.width).toBe(frame.width);
    }
  });

  it("allows shrinking groups below 100 percent for extra design space", () => {
    const baseline = buildSyncedClassPhoto("landscape", 16, 0, "Class Photo", "");
    const baselinePlan = baseline.rule.metadata["classPhotoAutoLayout"] as { childFrameSize: number };
    const canShrink = canApplyClassPhotoGroupScale(baseline.page.width, baseline.page.height, baseline.rule, {
      childGroupScale: 0.55,
      staffGroupScale: 1
    });
    const shrunk = syncClassPhotoToPage(baseline.page, {
      ...baseline.rule,
      layoutSettings: { ...baseline.rule.layoutSettings, childGroupScale: 0.55 }
    });
    const shrunkPlan = shrunk.rule.metadata["classPhotoAutoLayout"] as { childFrameSize: number };
    const people = shrunk.page.layers.filter((layer) => layer.metadata?.["classPhotoFrame"] || layer.metadata?.["classPhotoName"]);

    expect(canShrink).toBe(true);
    expect(shrunk.overflows).toBe(false);
    expect(shrunk.rule.layoutSettings.childGroupScale).toBe(0.55);
    expect(shrunkPlan.childFrameSize).toBeLessThan(baselinePlan.childFrameSize);
    expect(allInsidePage(people, shrunk.page.width, shrunk.page.height)).toBe(true);
  });

  it("rejects group scaling that would make the fitted layout overflow", () => {
    const { page, rule } = buildSyncedClassPhoto("landscape", 35, 5);
    const plan = rule.metadata["classPhotoAutoLayout"] as { childFrameSize: number };
    const canScale = canApplyClassPhotoGroupScale(page.width, page.height, rule, {
      childGroupScale: 1.05,
      staffGroupScale: 1
    });
    const forced = syncClassPhotoToPage(page, {
      ...rule,
      layoutSettings: { ...rule.layoutSettings, childGroupScale: 1.05 }
    });
    const forcedPlan = forced.rule.metadata["classPhotoAutoLayout"] as { childFrameSize: number };

    expect(canScale).toBe(false);
    expect(forced.overflows).toBe(false);
    expect(forced.rule.layoutSettings.childGroupScale).toBe(1);
    expect(forcedPlan.childFrameSize).toBeGreaterThanOrEqual(plan.childFrameSize);
  });
});

function buildSyncedClassPhoto(
  orientation: "portrait" | "landscape",
  childCount: number,
  staffCount: number,
  titleText = "Class Photo",
  footerText = "Footer",
  layoutPatch: Partial<ReturnType<typeof defaultLayoutSettings>> = {}
) {
  const setup = pageSetupFromPreset(getPagePreset("a4"), orientation);
  const people = makePeople(childCount, staffCount);
  const layoutSettings = { ...defaultLayoutSettings(setup.size.width, setup.size.height, childCount, staffCount), ...layoutPatch };
  const doc = createClassPhotoModeDocument(
    "Class photo test",
    setup,
    [],
    people,
    titleText,
    footerText,
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

function buildSyncedClassPhotoWithPeople(
  orientation: "portrait" | "landscape",
  people: ClassPhotoPersonRecord[],
  titleText = "Class Photo",
  footerText = "Footer",
  layoutPatch: Partial<ReturnType<typeof defaultLayoutSettings>> = {}
) {
  const setup = pageSetupFromPreset(getPagePreset("a4"), orientation);
  const childCount = people.filter((person) => person.role === "child").length;
  const staffCount = people.filter((person) => person.role === "staff").length;
  const layoutSettings = { ...defaultLayoutSettings(setup.size.width, setup.size.height, childCount, staffCount), ...layoutPatch };
  const doc = createClassPhotoModeDocument(
    "Class photo test",
    setup,
    [],
    people,
    titleText,
    footerText,
    layoutSettings,
    defaultVisualBalanceSettings(),
    defaultChildFrameStyle(),
    defaultStaffFrameStyle()
  );
  const rule = doc.classPhotoRules[0];
  const page = doc.pages[0];
  if (!rule || !page) throw new Error("Missing class photo rule or page");
  return syncClassPhotoToPage(page, rule);
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

function allInsidePage(layers: VisualLayer[], pageW: number, pageH: number): boolean {
  return layers.every((layer) =>
    layer.x >= -0.01 &&
    layer.y >= -0.01 &&
    layer.x + layer.width <= pageW + 0.01 &&
    layer.y + layer.height <= pageH + 0.01
  );
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
