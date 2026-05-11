import type { ID, JsonValue, VersionedEntity } from "./primitives";

export interface Preset extends VersionedEntity {
  id: ID;
  name: string;
  scope: "grid" | "text" | "mask" | "print" | "export" | "color";
  data: Record<string, JsonValue>;
  isDefault?: boolean;
  isShared?: boolean;
  thumbnail?: string;
  createdAt: string;
}
