/**
 * Helpers for the persisted `layer.editState.disabled` set — the list of
 * synthetic edit ids the user muted for edit-sources that have no native
 * `enabled` flag (legacy effects, text effects). Pure: every helper returns a
 * new layer; the panel commits it via the generic `updateLayer` action.
 */

import type { VisualLayer } from "@/types/layers";

export function isEditDisabled(layer: VisualLayer, editId: string): boolean {
  return layer.editState?.disabled?.includes(editId) === true;
}

export function disabledEditIds(layer: VisualLayer): string[] {
  return layer.editState?.disabled ?? [];
}

/** Return a layer with `editId` added to / removed from the disabled set. */
export function withEditDisabled<T extends VisualLayer>(layer: T, editId: string, disabled: boolean): T {
  const current = layer.editState?.disabled ?? [];
  const has = current.includes(editId);
  if (disabled === has) return layer;
  const nextDisabled = disabled ? [...current, editId] : current.filter((id) => id !== editId);
  return { ...layer, editState: { ...layer.editState, disabled: nextDisabled } };
}

/** Return a layer with the given ids added to the disabled set (idempotent). */
export function withEditsDisabled<T extends VisualLayer>(layer: T, editIds: string[]): T {
  const current = new Set(layer.editState?.disabled ?? []);
  for (const id of editIds) current.add(id);
  return { ...layer, editState: { ...layer.editState, disabled: [...current] } };
}

/** Return a layer with an empty disabled set. */
export function withAllEditsEnabled<T extends VisualLayer>(layer: T): T {
  if ((layer.editState?.disabled?.length ?? 0) === 0) return layer;
  return { ...layer, editState: { ...layer.editState, disabled: [] } };
}
