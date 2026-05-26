import { defaultViewportState } from "@/core/defaults";
import { createProjectMetadata } from "@/core/projectMetadata";
import { migrateProjectTextLayers } from "@/core/text/migration";
import { APP_VERSION, PROJECT_FORMAT_VERSION, PROJECT_SCHEMA_VERSION, type ProjectEnvelope } from "@/types/project";
import type { CollageRule } from "@/types/collage";
import { DEFAULT_IMAGE_LAYER_EFFECTS } from "@/types/layers";

export interface ProjectMigration {
  fromSchema: number;
  toSchema: number;
  description: string;
  migrate: (project: ProjectEnvelope) => ProjectEnvelope;
}

export const PROJECT_MIGRATIONS: ProjectMigration[] = [
  {
    fromSchema: 1,
    toSchema: 2,
    description: "הוספת metadata מלא לנכסים ולשמירה ניידת",
    migrate: (project) => ({
      ...project,
      schemaVersion: 2,
      document: {
        ...project.document,
        assets: project.document.assets.map((asset) => ({
          ...asset,
          status: asset.status ?? "ready",
          thumbnailPath: asset.thumbnailPath ?? asset.previewPath,
          hash: asset.hash ?? asset.checksum,
          fileSize: asset.fileSize ?? 0
        }))
      }
    })
  },
  {
    fromSchema: 2,
    toSchema: 3,
    description: "הוספת behaviorMode ו-contentTransform לפריימים (Phase 2)",
    migrate: (project) => ({
      ...project,
      schemaVersion: 3,
      document: {
        ...project.document,
        pages: project.document.pages.map((page) => ({
          ...page,
          layers: page.layers.map((layer) => {
            if (layer.type !== "frame") return layer;
            const frame = layer as typeof layer & {
              behaviorMode?: string;
              contentTransform?: object;
            };
            return {
              ...frame,
              behaviorMode: frame.behaviorMode ?? "freeform",
              contentTransform: frame.contentTransform ?? {
                version: 1,
                offsetX: 0,
                offsetY: 0,
                scale: 1,
                rotation: 0
              }
            };
          })
        }))
      }
    })
  },
  {
    fromSchema: 3,
    toSchema: 4,
    description: "Add persistent Grid Mode rule and assignment collections",
    migrate: (project) => ({
      ...project,
      schemaVersion: 4,
      document: {
        ...project.document,
        gridRules: project.document.gridRules ?? [],
        gridImageAssignments: project.document.gridImageAssignments ?? [],
        gridTextOverlayRules: project.document.gridTextOverlayRules ?? []
      }
    })
  },
  {
    fromSchema: 4,
    toSchema: 5,
    description: "Add persistent Mask Mode rule, assignment, overlay, and preset collections",
    migrate: (project) => ({
      ...project,
      schemaVersion: 5,
      document: {
        ...project.document,
        maskRules: project.document.maskRules ?? [],
        maskImageAssignments: project.document.maskImageAssignments ?? [],
        maskTextOverlayRules: project.document.maskTextOverlayRules ?? [],
        maskPresets: project.document.maskPresets ?? []
      }
    })
  },
  {
    fromSchema: 5,
    toSchema: 6,
    description: "Add Collage Mode rule collection (Phase 5)",
    migrate: (project) => ({
      ...project,
      schemaVersion: 6,
      document: {
        ...project.document,
        collageRules: ((project.document as unknown) as Record<string, unknown>).collageRules as CollageRule[] ?? []
      }
    })
  },
  {
    fromSchema: 7,
    toSchema: 8,
    description: "Add Class Photo Mode rule collection (Phase 6)",
    migrate: (project) => ({
      ...project,
      schemaVersion: 8,
      document: {
        ...project.document,
        classPhotoRules: ((project.document as unknown) as Record<string, unknown>).classPhotoRules as import("@/types/classPhoto").ClassPhotoLayoutRule[] ?? []
      }
    })
  },
  {
    fromSchema: 6,
    toSchema: 7,
    description: "Collage architecture refactor: layouts[] snapshot → activeFamily + spacingMM + marginMM + cachedSlots",
    migrate: (project) => ({
      ...project,
      schemaVersion: 7,
      document: {
        ...project.document,
        collageRules: (
          (((project.document as unknown) as Record<string, unknown>).collageRules as Array<Record<string, unknown>> | undefined) ?? []
        ).map((rule) => {
          // If rule already has the new shape, pass through
          if (rule.activeFamily !== undefined && rule.cachedSlots !== undefined) return rule;

          // Old shape: layouts[] + activeLayoutId
          const layouts = (rule.layouts as Array<Record<string, unknown>> | undefined) ?? [];
          const activeLayoutId = rule.activeLayoutId as string | undefined;
          const activeLayout = layouts.find((l) => l.id === activeLayoutId) ?? layouts[0];
          const cachedSlots = (activeLayout?.slots as CollageRule["cachedSlots"] | undefined) ?? [];
          const activeFamily = (activeLayout?.family as CollageRule["activeFamily"] | undefined) ?? "grid";

          const { layouts: _layouts, activeLayoutId: _activeLayoutId, ...rest } = rule;
          void _layouts; void _activeLayoutId;

          return {
            ...rest,
            activeFamily,
            spacingMM: 3,
            marginMM: 4,
            cachedSlots,
            splitTree: (activeLayout?.splitTree as CollageRule["splitTree"] | undefined) ?? undefined,
          };
        }) as unknown as CollageRule[]
      }
    })
  },
  {
    fromSchema: 8,
    toSchema: 9,
    description: "איחוד color adjustments לשדה effects מוקלד על כל ImageLayer",
    migrate: (project) => ({
      ...project,
      schemaVersion: 9,
      document: {
        ...project.document,
        pages: project.document.pages.map((page) => ({
          ...page,
          layers: page.layers.map((layer) => {
            if (layer.type !== "image") return layer;
            const meta = (layer.metadata?.["imageEditParams"] ?? {}) as Record<string, unknown>;
            const num = (k: string): number => (typeof meta[k] === "number" ? (meta[k] as number) : 0);
            return {
              ...layer,
              effects: {
                version: 1,
                brightness: num("brightness"),
                contrast: num("contrast"),
                saturation: num("saturation"),
                exposure: num("exposure"),
                hue: num("hue"),
                grayscale: meta["black_white"] === true,
                blur: num("blur"),
                shadow: null,
                outline: null
              }
            };
          })
        }))
      }
    })
  },
  {
    fromSchema: 9,
    toSchema: 10,
    description: "הוספת שדה pixelMask לשכבות תמונה (Image Edit Mode)",
    migrate: (project) => ({
      ...project,
      schemaVersion: 10,
      document: {
        ...project.document,
        pages: project.document.pages.map((page) => ({
          ...page,
          layers: page.layers.map((layer) => {
            if (layer.type !== "image") return layer;
            const imgLayer = layer as typeof layer & { pixelMask?: unknown };
            if (imgLayer.pixelMask !== undefined) return layer;
            return { ...layer, pixelMask: undefined };
          })
        }))
      }
    })
  },
  {
    fromSchema: 11,
    toSchema: 12,
    description: "הוספת blessingRules למסמך (מצב ברכות v1)",
    migrate: (project) => ({
      ...project,
      schemaVersion: 12,
      document: {
        ...project.document,
        blessingRules: (((project.document as unknown) as Record<string, unknown>).blessingRules as import("@/types/blessing").BlessingRule[]) ?? []
      }
    })
  },
  {
    fromSchema: 10,
    toSchema: 11,
    description: "מצב מסיכה: הוספת spacingMM קנוני, spacingUnit ו-maskStyle (מסגרת/צל לכל המסיכות)",
    migrate: (project) => {
      const dpi = project.document.dpi || 300;
      return {
        ...project,
        schemaVersion: 11,
        document: {
          ...project.document,
          maskRules: (project.document.maskRules ?? []).map((rule) => {
            if (typeof rule.spacingMM === "number") return rule;
            const px = Math.max(rule.spacingX ?? 0, rule.spacingY ?? 0);
            const mm = (px / dpi) * 25.4;
            return {
              ...rule,
              spacingMM: Math.max(0, mm),
              spacingUnit: rule.spacingUnit ?? "mm"
            };
          })
        }
      };
    }
  }
];

export function normalizeProjectEnvelope(input: unknown): ProjectEnvelope {
  if (!isProjectEnvelopeLike(input)) {
    throw new Error("Invalid SPP project envelope");
  }
  const metadata = createProjectMetadata(input.metadata, input.document);
  let project: ProjectEnvelope = {
    format: "SPP_PROJECT",
    version: PROJECT_FORMAT_VERSION,
    projectVersion: input.projectVersion ?? String(input.version ?? PROJECT_FORMAT_VERSION),
    appVersion: input.appVersion ?? APP_VERSION,
    schemaVersion: input.schemaVersion ?? 1,
    metadata,
    document: {
      ...input.document,
      gridRules: input.document.gridRules ?? [],
      gridImageAssignments: input.document.gridImageAssignments ?? [],
      gridTextOverlayRules: input.document.gridTextOverlayRules ?? [],
      maskRules: input.document.maskRules ?? [],
      maskImageAssignments: input.document.maskImageAssignments ?? [],
      maskTextOverlayRules: input.document.maskTextOverlayRules ?? [],
      maskPresets: input.document.maskPresets ?? [],
      collageRules: ((input.document as unknown) as Record<string, unknown>).collageRules as CollageRule[] ?? [],
      blessingRules: ((input.document as unknown) as Record<string, unknown>).blessingRules as import("@/types/blessing").BlessingRule[] ?? [],
      classPhotoRules: (((input.document as unknown) as Record<string, unknown>).classPhotoRules as Array<Record<string, unknown>> | undefined ?? []).map((r) => ({
        ...r,
        titleTextEffects: (r["titleTextEffects"] as unknown[]) ?? [],
        footerTextEffects: (r["footerTextEffects"] as unknown[]) ?? []
      })) as import("@/types/classPhoto").ClassPhotoLayoutRule[],
      viewport: input.document.viewport ?? { ...defaultViewportState },
      assets: input.document.assets ?? [],
      pages: input.document.pages.map((page) => ({
        ...page,
        layers: page.layers.map((layer) => {
          if (layer.type !== "image") return layer;
          const imgLayer = layer as typeof layer & { effects?: unknown };
          if (imgLayer.effects !== undefined) return layer;
          return { ...layer, effects: { ...DEFAULT_IMAGE_LAYER_EFFECTS } };
        }),
        setup: page.setup ?? {
          version: 1,
          units: "px",
          size: { width: page.width, height: page.height },
          dpi: input.document.dpi,
          orientation: page.orientation,
          bleed: page.bleed,
          margins: page.margins,
          safeArea: page.margins,
          backgroundColor: page.background.color ?? "#fbfafa",
          backgroundTransparent: page.background.type === "transparent",
          printIntent: "photo",
          rulerOrigin: "page",
          snapSettings: {
            version: 1,
            enabled: true,
            snapToGrid: true,
            snapToGuides: true,
            snapToLayers: true,
            snapToPage: true,
            snapTolerance: 8,
            showSmartGuides: true
          },
          gridSettings: {
            version: 1,
            enabled: true,
            spacingX: 60,
            spacingY: 60,
            subdivisions: 4,
            color: "#7C6FE0",
            opacity: 0.18,
            snapToGrid: false
          },
          metadata: {}
        }
      }))
    },
    linkedGroups: input.linkedGroups ?? [],
    batchJobs: input.batchJobs ?? []
  };

  while (project.schemaVersion < PROJECT_SCHEMA_VERSION) {
    const migration = PROJECT_MIGRATIONS.find((item) => item.fromSchema === project.schemaVersion);
    if (migration === undefined) {
      throw new Error(`Missing project migration for schema ${project.schemaVersion}`);
    }
    project = migration.migrate(project);
  }
  return migrateProjectTextLayers(project);
}

function isProjectEnvelopeLike(value: unknown): value is Partial<ProjectEnvelope> & { document: ProjectEnvelope["document"] } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ProjectEnvelope>;
  return candidate.format === "SPP_PROJECT" && typeof candidate.document === "object" && candidate.document !== null && Array.isArray(candidate.document.pages);
}
