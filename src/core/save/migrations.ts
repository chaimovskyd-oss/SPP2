import { defaultViewportState } from "@/core/defaults";
import { migrateProjectTextLayers } from "@/core/text/migration";
import { APP_VERSION, PROJECT_FORMAT_VERSION, PROJECT_SCHEMA_VERSION, type ProjectEnvelope } from "@/types/project";

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
  }
];

export function normalizeProjectEnvelope(input: unknown): ProjectEnvelope {
  if (!isProjectEnvelopeLike(input)) {
    throw new Error("Invalid SPP project envelope");
  }
  let project: ProjectEnvelope = {
    format: "SPP_PROJECT",
    version: PROJECT_FORMAT_VERSION,
    projectVersion: input.projectVersion ?? String(input.version ?? PROJECT_FORMAT_VERSION),
    appVersion: input.appVersion ?? APP_VERSION,
    schemaVersion: input.schemaVersion ?? 1,
    document: {
      ...input.document,
      gridRules: input.document.gridRules ?? [],
      gridImageAssignments: input.document.gridImageAssignments ?? [],
      gridTextOverlayRules: input.document.gridTextOverlayRules ?? [],
      viewport: input.document.viewport ?? { ...defaultViewportState },
      assets: input.document.assets ?? [],
      pages: input.document.pages.map((page) => ({
        ...page,
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
