import { beforeEach, describe, expect, it } from "vitest";
import { useDocumentStore } from "@/state/documentStore";
import { createFreeModeDocument } from "@/ui/projectActions";
import { canApplyAsPageLook, getPreset, listPresets } from "@/core/presets/smartPresets";
import { createPageLookLayer, pageLookMaster } from "@/types/imageAdjustments";
import type { PageLookLayer } from "@/types/imageAdjustments";
import type { Page } from "@/types/document";

function seedPage(): string {
  const document = createFreeModeDocument("PageLooks");
  const page = document.pages[0];
  if (page === undefined) throw new Error("missing page");
  useDocumentStore.getState().setDocument(document);
  return page.id;
}

function readPage(pageId: string): Page {
  const page = useDocumentStore.getState().document?.pages.find((p) => p.id === pageId);
  if (page === undefined) throw new Error("missing page");
  return page;
}

function looks(pageId: string): PageLookLayer[] {
  return readPage(pageId).pageLooks ?? [];
}

describe("page-look engine", () => {
  it("page-look presets carry an effect and allow the pageLook mode", () => {
    const lookPresets = listPresets().filter(canApplyAsPageLook);
    expect(lookPresets.length).toBeGreaterThan(0);
    for (const preset of lookPresets) {
      expect(preset.pageLookEffect).toBeDefined();
      expect(preset.allowedApplyModes).toContain("pageLook");
    }
  });

  it("createPageLookLayer fills defaults and a fresh id", () => {
    const a = createPageLookLayer({ kind: "vignette" });
    const b = createPageLookLayer({ kind: "vignette" });
    expect(a.id).not.toBe(b.id);
    expect(a.enabled).toBe(true);
    expect(a.opacity).toBe(1);
    expect(a.strength).toBe(1);
    expect(a.effect.kind).toBe("vignette");
  });

  it("pageLookMaster multiplies opacity and strength, clamped", () => {
    expect(pageLookMaster({ opacity: 0.5, strength: 0.5 })).toBeCloseTo(0.25);
    expect(pageLookMaster({ opacity: 2, strength: 2 })).toBe(1);
    expect(pageLookMaster({ opacity: -1, strength: 0.5 })).toBe(0);
  });
});

describe("page-look store actions", () => {
  beforeEach(() => {
    useDocumentStore.getState().clearDocument();
  });

  it("addPageLook appends to a previously empty page", () => {
    const pageId = seedPage();
    expect(readPage(pageId).pageLooks).toBeUndefined();
    useDocumentStore.getState().addPageLook(pageId, createPageLookLayer({ kind: "wash", color: "#8b5a2b" }));
    expect(looks(pageId)).toHaveLength(1);
    expect(looks(pageId)[0]!.effect.kind).toBe("wash");
  });

  it("toggle / update meta / update effect mutate only the target look", () => {
    const pageId = seedPage();
    const store = useDocumentStore.getState();
    store.addPageLook(pageId, createPageLookLayer({ kind: "colorOverlay", color: "#000000" }));
    const id = looks(pageId)[0]!.id;

    store.togglePageLook(pageId, id);
    expect(looks(pageId)[0]!.enabled).toBe(false);

    store.updatePageLook(pageId, id, { strength: 0.4 });
    expect(looks(pageId)[0]!.strength).toBe(0.4);

    store.updatePageLookEffect(pageId, id, { opacity: 0.7 });
    const effect = looks(pageId)[0]!.effect;
    expect(effect.kind === "colorOverlay" && effect.opacity).toBe(0.7);
  });

  it("removePageLook drops the array back to undefined when empty", () => {
    const pageId = seedPage();
    const store = useDocumentStore.getState();
    store.addPageLook(pageId, createPageLookLayer({ kind: "grain" }));
    const id = looks(pageId)[0]!.id;
    store.removePageLook(pageId, id);
    expect(readPage(pageId).pageLooks).toBeUndefined();
  });

  it("reorderPageLook swaps order and is undoable", () => {
    const pageId = seedPage();
    const store = useDocumentStore.getState();
    store.addPageLook(pageId, createPageLookLayer({ kind: "wash" }, { name: "first" }));
    store.addPageLook(pageId, createPageLookLayer({ kind: "vignette" }, { name: "second" }));
    const [first, second] = looks(pageId);
    expect([first!.name, second!.name]).toEqual(["first", "second"]);

    // "up" moves a look later in the render order (toward the top of the stack)
    store.reorderPageLook(pageId, first!.id, "up");
    expect(looks(pageId).map((l) => l.name)).toEqual(["second", "first"]);

    store.undo();
    expect(looks(pageId).map((l) => l.name)).toEqual(["first", "second"]);
  });

  it("applyPresetAsPageLook instantiates the preset's effect with its default strength", () => {
    const pageId = seedPage();
    const lookPreset = listPresets().find(canApplyAsPageLook)!;
    useDocumentStore.getState().applyPresetAsPageLook(pageId, lookPreset.id);

    const look = looks(pageId)[0]!;
    expect(look.presetId).toBe(lookPreset.id);
    expect(look.strength).toBe(lookPreset.defaultStrength);
    expect(look.effect.kind).toBe(getPreset(lookPreset.id)!.pageLookEffect!.kind);
  });

  it("each page-look mutation is a single undo record", () => {
    const pageId = seedPage();
    const store = useDocumentStore.getState();
    const before = useDocumentStore.getState().meaningfulActionCount;
    store.addPageLook(pageId, createPageLookLayer({ kind: "wash" }));
    expect(useDocumentStore.getState().meaningfulActionCount).toBe(before + 1);
    store.undo();
    expect(readPage(pageId).pageLooks ?? []).toHaveLength(0);
  });
});
