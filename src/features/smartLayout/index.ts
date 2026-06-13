export * from "./types";
export { captureDesignUnit, emitUnitInstance, unitSupportsRotation, type DesignUnit } from "./designUnit";
export { solveRepeat } from "./repeatGridSolver";
export { solvePhotoPack } from "./photoPackingSolver";
export { scorePackedPage } from "./layoutScoring";
export { buildCutLinePath, buildItemRectsPath } from "./cutLines";
export { computeUsableArea, buildGridCells, countAlongAxis } from "./pageGeometry";
export {
  buildRepeatResult,
  applyRepeatToDocument,
  buildPhotoPackResult,
  createSmartPhotoPackDocument,
  assetToPackInput,
  type ApplyRepeatParams
} from "./SmartLayoutEngine";
