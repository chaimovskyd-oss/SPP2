/**
 * Feature flags for the adjustment-layer rewrite (Smart Presets + Image
 * Adjustments + Page Look).
 *
 * The legacy Photoshop-style AdjustmentLayer rendering wraps every layer below
 * it in a full-page Konva Group cache (node.cache({ width: pageWidth, height:
 * pageHeight })). On large pages (4000x3000+) this allocates huge GPU textures,
 * destabilizes rendering, and can blank the canvas. Until a proper
 * CompositeRenderer exists, classic rendering stays disabled and legacy layers
 * are migrated to image-level adjustments / page looks.
 */

/** Render legacy AdjustmentLayer live in CanvasStage via AdjustmentFilterGroup. */
export const ENABLE_CLASSIC_ADJUSTMENT_LAYER_RENDERING = false;

/** Allow the full-page node.cache() snapshot used by classic rendering. */
export const ENABLE_FULL_PAGE_ADJUSTMENT_CACHE = false;

/** Per-image non-destructive ImageAdjustment stack (new architecture). */
export const ENABLE_IMAGE_LEVEL_ADJUSTMENTS = true;

/** Always-top PageLookLayer effects (new architecture). */
export const ENABLE_PAGE_LOOK_LAYERS = true;

/**
 * Smart Shadow/Highlights V2: scene-aware modulation (faces / skin / sky / noise)
 * layered on the V1 local Shadow/Highlights engine. Gates whether the Shadow/
 * Highlights modal shows the "Smart Options" section and runs scene analysis.
 * The render pipeline keys off each adjustment's own `smart` flag, so turning
 * this off simply stops new adjustments from enabling V2 — existing pure-V1
 * results are unaffected.
 */
export const ENABLE_SMART_SHADOW_HIGHLIGHTS_V2 = true;

/**
 * Allow creating legacy AdjustmentLayers from the Layers-panel "+" menu. These
 * don't render live (ENABLE_CLASSIC_ADJUSTMENT_LAYER_RENDERING is off), so they
 * appear "disconnected". Disabled in favor of the Tool Library / Image
 * Adjustments path; kept behind a flag for debugging the legacy migration.
 */
export const ENABLE_LEGACY_ADJUSTMENT_LAYER_CREATION = false;
