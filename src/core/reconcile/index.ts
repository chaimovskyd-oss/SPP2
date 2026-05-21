export {
  adaptContentTransform,
  aspectChangedSignificantly,
  IDENTITY_TRANSFORM,
} from "./transformAdapt";
export type { AdaptResult, SlotDims } from "./transformAdapt";

export {
  readOverflow,
  writeOverflow,
  pushOverflow,
  drainOverflow,
  clearOverflow,
} from "./overflowPool";
export type { CollageOverflowPool } from "./overflowPool";

export {
  snapshotFrameState,
  restoreFrameState,
} from "./preserveFrameState";
export type { PreservedFrameState } from "./preserveFrameState";
