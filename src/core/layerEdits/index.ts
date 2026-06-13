export type {
  LayerEditAdapter,
  LayerEditCapabilities,
  LayerEditDescriptor,
  LayerEditSource
} from "@/core/layerEdits/types";
export { collectLayerEdits, countLayerEdits, hasDisabledLayerEdits } from "@/core/layerEdits/collectLayerEdits";
export {
  getLayerEditAdapter,
  getLayerEditAdapters,
  registerLayerEditAdapter
} from "@/core/layerEdits/registry";
export { resolveEffectiveLayer, persistedMutedSet } from "@/core/layerEdits/resolveEffectiveLayer";
export { setAllLayerEditsEnabled, resetAllLayerEdits } from "@/core/layerEdits/bulkOps";
export {
  disabledEditIds,
  isEditDisabled,
  withAllEditsEnabled,
  withEditDisabled,
  withEditsDisabled
} from "@/core/layerEdits/editState";
