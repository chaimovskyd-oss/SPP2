import { createDocument, createPage } from "@/core/document/factory";
import { createCollageRule } from "@/core/collage/collageFactory";
import { generateCollageSuggestions, assignByPoolOrder, syncFrameLayersToPage } from "@/core/collage/collageModeEngine";
import { applySmartCropToAssignment } from "@/core/collage/collageFrameSync";
import { mmToPx } from "@/core/units/conversion";
import type { Asset, Page } from "@/types/document";
import type { CollageImageInput, CollageLayoutFamily, CollageRule, ScoredLayoutSuggestion } from "@/types/collage";
import type {
  BatchCollageAssetGroup,
  BatchCollageBuildResult,
  BatchCollageBuildWarning,
  BatchCollageCreatedGroup,
  BatchCollageSettings,
} from "@/types/batchCollage";
import type { JsonValue, Metadata } from "@/types/primitives";

export const BATCH_COLLAGE_SAFE_FAMILIES = new Set<CollageLayoutFamily>([
  "grid",
  "hero",
  "heroBottom",
  "heroLeft",
  "magazine",
  "mosaic",
  "dualHero",
  "triptych",
  "wideBanner",
  "modularIrregular",
  "heroSupport",
]);

export interface CreateBatchCollageDocumentOptions {
  name: string;
  groups: BatchCollageAssetGroup[];
  settings: BatchCollageSettings;
  metadata?: Metadata;
}

export async function createBatchCollageDocument(
  options: CreateBatchCollageDocumentOptions
): Promise<BatchCollageBuildResult> {
  const warnings: BatchCollageBuildWarning[] = [];
  const createdGroups: BatchCollageCreatedGroup[] = [];
  const pages: Page[] = [];
  const rules: CollageRule[] = [];
  const assets: Asset[] = [];
  const validGroups = options.groups.filter((group) => {
    if (group.assets.length > 0) return true;
    warnings.push({ groupId: group.id, groupName: group.name, message: "Group has no images and was skipped." });
    return false;
  }).slice(0, options.settings.maxCollages);

  if (options.groups.length > options.settings.maxCollages) {
    warnings.push({
      groupId: "batch",
      groupName: "Batch",
      message: `Only the first ${options.settings.maxCollages} groups were created.`,
    });
  }

  for (const group of validGroups) {
    const groupName = group.name.trim() || "Collage";
    const page = createPage({
      setup: options.settings.pageSetup,
      name: groupName,
      metadata: { batchCollageGroupId: group.id, batchCollageGroupName: groupName }
    });
    const imageInputs = assetsToImageInputs(group.assets);
    const spacingPx = mmToPx(options.settings.spacingMm, page.setup.dpi);
    const marginPx = mmToPx(options.settings.marginMm, page.setup.dpi);
    const suggestions = generateCollageSuggestions(
      imageInputs,
      page.width,
      page.height,
      spacingPx,
      marginPx,
      "creative"
    );
    const filtered = filterBatchSuggestions(suggestions, options.settings.allowedLayoutMode);
    const chosen = filtered[0] ?? suggestions[0];

    if (chosen === undefined) {
      warnings.push({ groupId: group.id, groupName, message: "No valid collage layout was found." });
      continue;
    }

    let rule: CollageRule = {
      ...createCollageRule(
        page.id,
        chosen.family,
        chosen.slots,
        group.assets.map((asset) => asset.id),
        options.settings.spacingMm,
        options.settings.marginMm
      ),
      name: groupName,
      smartCropEnabled: options.settings.smartCropEnabled,
      smartCropMode: options.settings.smartCropEnabled ? "face" as const : "none" as const,
      metadata: {
        batchCollageGroupId: group.id,
        batchCollageGroupName: groupName,
        batchChosenScore: chosen.score,
      }
    };

    rule = {
      ...rule,
      imageAssignments: assignByPoolOrder(rule.imagePool, rule.cachedSlots, rule.id, rule.imageAssignments, rule.cachedSlots, imageInputs)
    };

    if (options.settings.smartCropEnabled) {
      rule = await applyBatchSmartCrop(rule, page, group.assets, warnings, group.id, groupName);
    }

    const { page: syncedPage, frameIds } = syncFrameLayersToPage(page, rule, page.width, page.height);
    const syncedRule = { ...rule, frameIds };
    pages.push(syncedPage);
    rules.push(syncedRule);
    assets.push(...group.assets.filter((asset) => !assets.some((existing) => existing.id === asset.id)));
    createdGroups.push({
      groupId: group.id,
      groupName,
      pageId: page.id,
      collageRuleId: rule.id,
      chosenLayoutFamily: chosen.family,
      chosenScore: chosen.score,
    });
  }

  const now = new Date().toISOString();
  return {
    document: {
      ...createDocument({
        name: options.name,
        now,
        dpi: options.settings.pageSetup.dpi,
        pages,
        metadata: {
          mode: "collage",
          batchCollage: {
            version: 1,
            createdAt: now,
            groupCount: options.groups.length,
            createdCount: pages.length,
            settings: {
              allowedLayoutMode: options.settings.allowedLayoutMode,
              smartCropEnabled: options.settings.smartCropEnabled,
              spacingMm: options.settings.spacingMm,
              marginMm: options.settings.marginMm,
            },
            groups: createdGroups as unknown as JsonValue,
          } as unknown as JsonValue,
          ...(options.metadata ?? {}),
        }
      }),
      assets,
      collageRules: rules,
    },
    createdCount: pages.length,
    warnings,
    failedCount: validGroups.length - pages.length,
  };
}

export function filterBatchSuggestions(
  suggestions: ScoredLayoutSuggestion[],
  allowedLayoutMode: BatchCollageSettings["allowedLayoutMode"]
): ScoredLayoutSuggestion[] {
  if (allowedLayoutMode === "allLayouts") return suggestions.filter(hasUsableImageSlots);
  return suggestions.filter((suggestion) => BATCH_COLLAGE_SAFE_FAMILIES.has(suggestion.family) && hasUsableImageSlots(suggestion));
}

function hasUsableImageSlots(suggestion: ScoredLayoutSuggestion): boolean {
  return suggestion.slots.some((slot) => slot.type === "image" && slot.w > 0 && slot.h > 0);
}

function assetsToImageInputs(assets: Asset[]): CollageImageInput[] {
  return assets.map((asset) => ({
    assetId: asset.id,
    width: asset.width ?? 800,
    height: asset.height ?? 600,
    faceRegions: Array.isArray(asset.metadata.faceRegions)
      ? asset.metadata.faceRegions as CollageImageInput["faceRegions"]
      : undefined,
    analysisScore: typeof asset.metadata.analysisScore === "number" ? asset.metadata.analysisScore : undefined,
  }));
}

async function applyBatchSmartCrop(
  rule: CollageRule,
  page: Page,
  groupAssets: Asset[],
  warnings: BatchCollageBuildWarning[],
  groupId: string,
  groupName: string
): Promise<CollageRule> {
  if (typeof Image === "undefined") return rule;
  const assetById = new Map(groupAssets.map((asset) => [asset.id, asset]));
  const slotById = new Map(rule.cachedSlots.map((slot) => [slot.id, slot]));
  const imageAssignments = [];

  for (const assignment of rule.imageAssignments) {
    const asset = assetById.get(assignment.assetId);
    const slot = slotById.get(assignment.slotId);
    if (asset === undefined || slot === undefined || assignment.hasManualTransform === true) {
      imageAssignments.push(assignment);
      continue;
    }
    try {
      const contentTransform = await applySmartCropToAssignment(
        assignment,
        asset,
        slot.w * page.width,
        slot.h * page.height
      );
      imageAssignments.push({ ...assignment, contentTransform });
    } catch (error) {
      warnings.push({
        groupId,
        groupName,
        message: error instanceof Error ? `Smart crop failed: ${error.message}` : "Smart crop failed.",
      });
      imageAssignments.push(assignment);
    }
  }

  return { ...rule, imageAssignments };
}
