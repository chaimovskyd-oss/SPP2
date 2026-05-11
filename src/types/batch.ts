import type { ID, Metadata, VersionedEntity } from "./primitives";

export type BatchJobType =
  | "importImages"
  | "fillFrames"
  | "smartCrop"
  | "faceDetect"
  | "exportPages"
  | "applyTextStyle"
  | "generatePages";

export interface BatchError extends VersionedEntity {
  id: ID;
  itemId?: ID;
  code: string;
  message: string;
  recoverable: boolean;
  metadata: Metadata;
}

export interface BatchJob extends VersionedEntity {
  id: ID;
  type: BatchJobType;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  progress: number;
  totalItems: number;
  completedItems: number;
  errors: BatchError[];
  cancellable: boolean;
  createdAt: string;
  updatedAt: string;
}
