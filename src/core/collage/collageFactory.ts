import { createId } from "@/core/ids";
import type {
  CollageCanvasSettings,
  CollageEdgeConfig,
  CollageImageAssignment,
  CollageLayout,
  CollageLayoutFamily,
  CollageRule,
  CollageSlot,
} from "@/types/collage";
import type { ID } from "@/types/primitives";

export function createCollageSlot(overrides: Partial<CollageSlot> & { x: number; y: number; w: number; h: number }): CollageSlot {
  return {
    version: 1,
    id: createId("cslot"),
    type: "image",
    shape: "rect",
    shapeParams: {},
    rotationDeg: 0,
    zIndex: 0,
    role: "",
    label: "",
    groupId: "",
    metadata: {},
    ...overrides
  };
}

export function createEmptySlot(x: number, y: number, w: number, h: number): CollageSlot {
  return createCollageSlot({ x, y, w, h, type: "empty", label: "תא ריק" });
}

function defaultEdgeConfig(): CollageEdgeConfig {
  return { style: "hard" };
}

export function defaultCanvasSettings(): CollageCanvasSettings {
  return {
    version: 1,
    backgroundType: "solid",
    backgroundColor: "#ffffff",
    spacingColor: "#ffffff",
    marginColor: "#ffffff",
    globalCornerRadius: 0,
    globalBorderWidth: 0,
    globalBorderColor: "#000000",
    globalShadowEnabled: false,
    globalShadowOffsetX: 2,
    globalShadowOffsetY: 2,
    globalShadowBlur: 8,
    globalShadowOpacity: 0.3,
    globalEdgeConfig: defaultEdgeConfig(),
    bleedMM: 0,
    safeAreaMM: 0
  };
}

/** Still available for template/preview use */
export function createCollageLayout(
  name: string,
  family: CollageLayout["family"],
  slots: CollageSlot[],
  imageCount: number
): CollageLayout {
  return {
    version: 1,
    id: createId("clayout"),
    name,
    family,
    slots,
    score: 0,
    scoreBreakdown: { aspectRatioScore: 0, faceSafetyScore: 0, balanceScore: 0, diversityScore: 0 },
    targetImageCount: imageCount,
    metadata: {}
  };
}

export function createCollageImageAssignment(
  collageRuleId: ID,
  assetId: ID,
  slotId: ID
): CollageImageAssignment {
  return {
    version: 1,
    id: createId("cassign"),
    collageRuleId,
    assetId,
    slotId,
    contentTransform: { version: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 },
    fitMode: "fill",
    colorAdjustments: {
      brightness: 1,
      contrast: 1,
      saturation: 1,
      sharpness: 1,
      isBlackAndWhite: false,
      exposureEV: 0,
      vignette: 0
    },
    metadata: {}
  };
}

/**
 * Create a CollageRule using the new architecture:
 * stores activeFamily + spacingMM + marginMM + cachedSlots.
 * Geometry is regenerated on demand from these values.
 */
export function createCollageRule(
  pageId: ID,
  activeFamily: CollageLayoutFamily,
  cachedSlots: CollageSlot[],
  assetIds: ID[],
  spacingMM = 3,
  marginMM = 4,
): CollageRule {
  const ruleId = createId("crule");
  const imageSlots = cachedSlots.filter((s) => s.type === "image");
  const assignments: CollageImageAssignment[] = imageSlots
    .flatMap((slot, i) => {
      const assetId = assetIds[i];
      if (!assetId) return [];
      return [createCollageImageAssignment(ruleId, assetId, slot.id)];
    });

  return {
    version: 1,
    id: ruleId,
    name: "קולאז'",
    pageId,
    activeFamily,
    spacingMM,
    marginMM,
    cachedSlots,
    imageAssignments: assignments,
    imagePool: [...assetIds],
    canvasSettings: defaultCanvasSettings(),
    smartCropEnabled: false,
    smartCropMode: "none",
    frameIds: [],
    metadata: {}
  };
}

/** Create a full collage-mode Document (same pattern as createGridModeDocument) */
export function createCollageModeDocument(
  name: string,
  page: import("@/types/document").Page,
  activeFamily: CollageLayoutFamily,
  cachedSlots: CollageSlot[],
  assetIds: ID[],
  spacingMM = 3,
  marginMM = 4,
  customerInfo?: Partial<import("@/types/project").ProjectCustomerInfo>
): import("@/types/document").Document {
  const rule = createCollageRule(page.id, activeFamily, cachedSlots, assetIds, spacingMM, marginMM);
  return {
    version: 1,
    id: createId("doc"),
    name,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    dpi: page.setup.dpi,
    colorProfile: "sRGB",
    pages: [page],
    assets: [],
    presets: [],
    gridRules: [],
    gridImageAssignments: [],
    gridTextOverlayRules: [],
    maskRules: [],
    maskImageAssignments: [],
    maskTextOverlayRules: [],
    maskPresets: [],
    collageRules: [rule],
    photoPrintRules: [],
    photoPrintImageAssignments: [],
    classPhotoRules: [],
    viewport: {
      version: 1,
      zoom: 1,
      panX: 0,
      panY: 0,
      screenWidth: 1200,
      screenHeight: 800,
      showRulers: false,
      showGrid: false,
      showGuides: true,
      snapEnabled: true,
      fitMode: "fitPage",
      backgroundStyle: "dark"
    },
    metadata: {
      mode: "collage",
      activeCollageId: rule.id,
      ...(customerInfo?.customerName ? { customerName: customerInfo.customerName } : {}),
      ...(customerInfo?.customerPhone ?? customerInfo?.phoneNumber ? { customerPhone: customerInfo.customerPhone ?? customerInfo.phoneNumber } : {}),
      ...(customerInfo?.customerEmail ?? customerInfo?.email ? { customerEmail: customerInfo.customerEmail ?? customerInfo.email } : {})
    }
  };
}
