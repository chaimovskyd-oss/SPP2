import type { PhotoPrintRule, PrintSizePreset } from "@/types/photoPrint";
import { PRINT_SIZE_PRESETS } from "@/types/photoPrint";

export type PassportStatus = "ok" | "review" | "notRecommended";

export interface PassportSizeMm {
  width: number;
  height: number;
}

export interface PassportRequirement {
  id: string;
  label: string;
  supportedSizes?: PassportSizeMm[];
  defaultSize?: PassportSizeMm;
  photoSizeMm?: PassportSizeMm;
  background: string;
  headHeightMmRange?: { min: number; max: number };
  headHeightPercentRange?: { min: number; max: number };
  faceRules?: {
    frontFacing?: boolean;
    eyesOpen?: boolean;
    neutralExpression?: boolean;
    noStrongShadows?: boolean;
    faceClearlyVisible?: boolean;
  };
  compositionGuidelines?: {
    keepFaceCentered?: boolean;
    maintainTopHeadMargin?: boolean;
    maintainChinMargin?: boolean;
    eyeLinePreferredUpperHalf?: boolean;
    includeShoulders?: boolean;
  };
  notes: string[];
}

const ISRAEL_BASE = {
  background: "plain white/light background",
  faceRules: {
    frontFacing: true,
    eyesOpen: true,
    neutralExpression: true,
    noStrongShadows: true,
    faceClearlyVisible: true
  },
  compositionGuidelines: {
    keepFaceCentered: true,
    maintainTopHeadMargin: true,
    maintainChinMargin: true,
    eyeLinePreferredUpperHalf: true
  },
  notes: [
    "Biometric-style frontal face",
    "Plain bright background",
    "No strong shadows",
    "Face fully visible",
    "Use the exact size required by the selected Israeli document/service"
  ]
} satisfies Pick<PassportRequirement, "background" | "faceRules" | "compositionGuidelines" | "notes">;

export const PASSPORT_REQUIREMENTS: Record<string, PassportRequirement> = {
  israelBiometric: {
    id: "israelBiometric",
    label: "Israeli Biometric / Official Photo",
    supportedSizes: [{ width: 35, height: 45 }, { width: 50, height: 50 }],
    defaultSize: { width: 35, height: 45 },
    ...ISRAEL_BASE
  },
  israelPassport35x45: {
    id: "israelPassport35x45",
    label: "Israeli Passport 35x45",
    supportedSizes: [{ width: 35, height: 45 }],
    defaultSize: { width: 35, height: 45 },
    ...ISRAEL_BASE
  },
  israelPassport50x50: {
    id: "israelPassport50x50",
    label: "Israeli Passport 50x50",
    supportedSizes: [{ width: 50, height: 50 }],
    defaultSize: { width: 50, height: 50 },
    ...ISRAEL_BASE
  },
  israelId: {
    id: "israelId",
    label: "Israeli ID Photo",
    supportedSizes: [{ width: 35, height: 45 }],
    defaultSize: { width: 35, height: 45 },
    ...ISRAEL_BASE
  },
  israelVisaEmbassy: {
    id: "israelVisaEmbassy",
    label: "Israeli Visa / Embassy Photo",
    supportedSizes: [{ width: 50, height: 50 }],
    defaultSize: { width: 50, height: 50 },
    ...ISRAEL_BASE
  },
  usPassport: {
    id: "usPassport",
    label: "US Passport",
    photoSizeMm: { width: 51, height: 51 },
    background: "plain white or off-white",
    headHeightMmRange: { min: 25, max: 35 },
    headHeightPercentRange: { min: 49, max: 69 },
    notes: ["2x2 inch photo", "Head height should be about 25-35mm", "Neutral expression", "Both eyes open", "Plain white/off-white background"]
  },
  usVisa: {
    id: "usVisa",
    label: "US Visa",
    photoSizeMm: { width: 51, height: 51 },
    background: "plain white or off-white",
    headHeightPercentRange: { min: 50, max: 69 },
    notes: ["Full-face view", "Neutral expression", "Both eyes open", "Plain background"]
  },
  ukPassport: {
    id: "ukPassport",
    label: "UK Passport",
    photoSizeMm: { width: 35, height: 45 },
    background: "plain light background",
    headHeightMmRange: { min: 29, max: 34 },
    compositionGuidelines: { includeShoulders: true },
    notes: ["Head from crown to chin should be about 29-34mm", "Include upper shoulders", "Clear and in focus"]
  },
  canadaPassport: {
    id: "canadaPassport",
    label: "Canada Passport",
    photoSizeMm: { width: 50, height: 70 },
    background: "plain white or light background",
    headHeightMmRange: { min: 31, max: 36 },
    notes: ["Face height from chin to crown should be about 31-36mm", "Neutral expression", "No shadows or glare"]
  }
};

const LEGACY_REQUIREMENT_BY_PRESET_ID: Record<string, string> = {
  passport_il: "israelBiometric",
  passport_us: "usPassport",
  passport_uk: "ukPassport",
  passport_ca: "canadaPassport"
};

export function isPassportPrintPreset(preset: PrintSizePreset | undefined): boolean {
  return preset?.passportRequirementId !== undefined || preset?.category === "passport" || preset?.category === "official";
}

export function getPassportRequirement(id: string | undefined): PassportRequirement | null {
  return id === undefined ? null : PASSPORT_REQUIREMENTS[id] ?? null;
}

export function getPassportPresetByRule(rule: PhotoPrintRule): PrintSizePreset | undefined {
  const presetId = typeof rule.metadata["printPresetId"] === "string" ? rule.metadata["printPresetId"] : rule.passportPresetId;
  return PRINT_SIZE_PRESETS.find((preset) =>
    preset.id === presetId ||
    (rule.passportPresetId !== undefined && preset.passportPresetId === rule.passportPresetId)
  );
}

export function resolvePassportRequirementForRule(rule: PhotoPrintRule): PassportRequirement | null {
  const direct = getPassportRequirement(rule.passportRequirementId);
  if (direct !== null) return direct;
  const preset = getPassportPresetByRule(rule);
  const requirementId = preset?.passportRequirementId ?? LEGACY_REQUIREMENT_BY_PRESET_ID[preset?.id ?? ""];
  return getPassportRequirement(requirementId);
}

export function resolvePassportSizeForRule(rule: PhotoPrintRule, requirement: PassportRequirement): PassportSizeMm {
  if (rule.passportSizeMm !== undefined) return rule.passportSizeMm;
  const preset = getPassportPresetByRule(rule);
  if (preset !== undefined) return { width: preset.widthMm, height: preset.heightMm };
  return requirement.defaultSize ?? requirement.photoSizeMm ?? { width: rule.printWidthMm, height: rule.printHeightMm };
}

export function getHeadHeightPercentRange(requirement: PassportRequirement, size: PassportSizeMm): { min: number; max: number } {
  if (requirement.headHeightPercentRange !== undefined) return requirement.headHeightPercentRange;
  if (requirement.headHeightMmRange !== undefined) {
    return {
      min: (requirement.headHeightMmRange.min / size.height) * 100,
      max: (requirement.headHeightMmRange.max / size.height) * 100
    };
  }
  return { min: 52, max: 72 };
}

export function passportStatusRank(status: PassportStatus): number {
  return status === "notRecommended" ? 2 : status === "review" ? 1 : 0;
}
