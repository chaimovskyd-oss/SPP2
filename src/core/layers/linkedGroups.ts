import type { FrameLayer, LinkedGroup, TextLayer, VisualLayer } from "@/types/layers";

export type LinkedGroupPatch = Partial<
  Pick<FrameLayer, "width" | "height" | "fitMode" | "padding" | "cornerRadius" | "shape"> &
    Pick<TextLayer, "fontFamily" | "fontWeight" | "fontSize" | "lineHeight" | "letterSpacing" | "color" | "alignment">
>;

function canReceivePatch(layer: VisualLayer, group: LinkedGroup): layer is FrameLayer | TextLayer {
  if (group.type === "textStyle") {
    return layer.type === "text";
  }
  if (group.type === "fitMode" || group.type === "spacing" || group.type === "size") {
    return layer.type === "frame";
  }
  return layer.type === "frame" || layer.type === "text";
}

export function applyLinkedGroupPatch(
  layers: VisualLayer[],
  group: LinkedGroup,
  patch: LinkedGroupPatch
): VisualLayer[] {
  const members = new Set(group.memberIds);
  return layers.map((layer) => {
    if (!members.has(layer.id) || !canReceivePatch(layer, group)) {
      return layer;
    }

    const override = group.perMemberOverrides[layer.id];
    if (override !== undefined && Object.keys(override).length > 0) {
      return {
        ...layer,
        ...patch,
        ...override
      } as VisualLayer;
    }

    return {
      ...layer,
      ...patch
    } as VisualLayer;
  });
}

export function withMemberOverride(
  group: LinkedGroup,
  memberId: string,
  override: LinkedGroup["perMemberOverrides"][string]
): LinkedGroup {
  if (!group.overridable) {
    return group;
  }

  return {
    ...group,
    perMemberOverrides: {
      ...group.perMemberOverrides,
      [memberId]: override
    }
  };
}

export function removeLinkedGroupMember(group: LinkedGroup, memberId: string): LinkedGroup {
  const { [memberId]: _removed, ...remainingOverrides } = group.perMemberOverrides;
  return {
    ...group,
    memberIds: group.memberIds.filter((id) => id !== memberId),
    perMemberOverrides: remainingOverrides
  };
}
