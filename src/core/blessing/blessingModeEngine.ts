import { createDocument, createPage } from "@/core/document/factory";
import { createId } from "@/core/ids";
import { createImageLayer, createTextLayer } from "@/core/layers/factory";
import type { Asset, Document, Page } from "@/types/document";
import type { VisualLayer } from "@/types/layers";
import type { ID } from "@/types/primitives";
import type { TextStyle } from "@/types/template";
import type { BlessingItem, BlessingRule, BlessingTemplateId, BlessingWizardResult, SourceQuoteItem } from "@/types/blessing";
import { BLESSING_TEMPLATES, getTemplate } from "./blessingTemplates";

export { BLESSING_TEMPLATES };

const TITLE_Y = 0.08;
const TITLE_H = 0.10;
const BODY_Y = 0.17;
const BODY_H = 0.66;
const BODY_W = 0.75;
const SIG_BOTTOM_PAD = 0.08;
const SIG_H = 0.08;

function defaultTextStyle(
  fontFamily: string,
  fontWeight: number,
  fontSize: number,
  color: string
): TextStyle {
  return {
    version: 1,
    fontFamily,
    fontWeight,
    fontSize,
    lineHeight: 1.28,
    letterSpacing: 0,
    color,
    alignment: "center",
    direction: "rtl"
  };
}

export function createMinimalBlessingAsset(
  filename: string,
  folder: "blessing-backgrounds" | "blessing-frames"
): Asset {
  const path = `./assets/${folder}/${filename}`;
  return {
    version: 1,
    id: `asset_bl_${folder.replace("blessing-", "")}_${filename.replace(/[^a-z0-9]/gi, "_")}`,
    name: filename,
    kind: "image",
    status: "ready",
    originalPath: path,
    previewPath: path,
    thumbnailPath: path,
    mimeType: filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
    metadata: { blessingAsset: true, folder }
  };
}

function buildBlessingLayersOnPage(
  page: Page,
  rule: BlessingRule,
  backgroundAsset: Asset | null,
  frameAsset: Asset | null
): { updatedPage: Page; updatedRule: BlessingRule } {
  const w = page.width;
  const h = page.height;
  const mainTextW = Math.round(w * BODY_W);
  const mainTextX = Math.round((w - mainTextW) / 2);

  const titleRect = { x: mainTextX, y: Math.round(h * TITLE_Y), width: mainTextW, height: Math.round(h * TITLE_H) };
  const bodyRect = { x: mainTextX, y: Math.round(h * BODY_Y), width: mainTextW, height: Math.round(h * BODY_H) };
  const sigRect = {
    x: mainTextX,
    y: Math.round(h * (1 - SIG_BOTTOM_PAD - SIG_H)),
    width: mainTextW,
    height: Math.round(h * SIG_H)
  };

  const newLayers: VisualLayer[] = [];
  const updatedRule = { ...rule };

  if (backgroundAsset) {
    const bgId = createId("image");
    newLayers.push(
      createImageLayer({
        id: bgId,
        name: "רקע",
        rect: { x: 0, y: 0, width: w, height: h },
        assetId: backgroundAsset.id,
        fitMode: "fill",
        zIndex: 0,
        metadata: { blessingBackground: true }
      })
    );
    updatedRule.backgroundLayerId = bgId;
  }

  if (rule.frameEnabled && frameAsset) {
    const frameId = createId("image");
    newLayers.push(
      createImageLayer({
        id: frameId,
        name: "מסגרת",
        rect: { x: 0, y: 0, width: w, height: h },
        assetId: frameAsset.id,
        fitMode: "fill",
        zIndex: 1,
        metadata: { blessingFrame: true }
      })
    );
    updatedRule.frameLayerId = frameId;
  } else {
    updatedRule.frameLayerId = undefined;
  }

  const titleId = createId("text");
  const titleStyle = rule.titleTextStyle;
  newLayers.push({
    ...createTextLayer({
      id: titleId,
      name: "כותרת",
      rect: titleRect,
      text: rule.titleText,
      zIndex: 2,
      metadata: { blessingTextRole: "title" }
    }),
    fontFamily: titleStyle.fontFamily,
    fontWeight: titleStyle.fontWeight,
    fontSize: titleStyle.fontSize,
    lineHeight: titleStyle.lineHeight,
    letterSpacing: titleStyle.letterSpacing,
    color: titleStyle.color,
    alignment: titleStyle.alignment,
    direction: titleStyle.direction
  });
  updatedRule.titleLayerId = titleId;

  const bodyId = createId("text");
  const bodyStyle = rule.bodyTextStyle;
  const effectiveFontSize = rule.bodyFontSizeComputed ?? bodyStyle.fontSize;
  newLayers.push({
    ...createTextLayer({
      id: bodyId,
      name: "טקסט ברכה",
      rect: bodyRect,
      text: rule.bodyText,
      zIndex: 3,
      metadata: { blessingTextRole: "body" }
    }),
    fontFamily: bodyStyle.fontFamily,
    fontWeight: bodyStyle.fontWeight,
    fontSize: effectiveFontSize,
    lineHeight: bodyStyle.lineHeight,
    letterSpacing: bodyStyle.letterSpacing,
    color: bodyStyle.color,
    alignment: bodyStyle.alignment,
    direction: bodyStyle.direction
  });
  updatedRule.bodyLayerId = bodyId;

  const sigId = createId("text");
  const sigStyle = rule.signatureTextStyle;
  newLayers.push({
    ...createTextLayer({
      id: sigId,
      name: "חתימה",
      rect: sigRect,
      text: rule.signatureText,
      zIndex: 4,
      metadata: { blessingTextRole: "signature" }
    }),
    fontFamily: sigStyle.fontFamily,
    fontWeight: sigStyle.fontWeight,
    fontSize: sigStyle.fontSize,
    lineHeight: sigStyle.lineHeight,
    letterSpacing: sigStyle.letterSpacing,
    color: sigStyle.color,
    alignment: sigStyle.alignment,
    direction: sigStyle.direction
  });
  updatedRule.signatureLayerId = sigId;

  return { updatedPage: { ...page, layers: newLayers }, updatedRule };
}

function createBlessingRule(pageId: ID, result: BlessingWizardResult): BlessingRule {
  const template = getTemplate(result.templateId);
  const titleStyle = defaultTextStyle(template.titleFontFamily, template.titleFontWeight, template.titleFontSize, template.titleColor);
  const bodyStyle = defaultTextStyle(template.bodyFontFamily, template.bodyFontWeight, template.bodyFontSize, template.bodyColor);
  const sigStyle = defaultTextStyle("Assistant", 400, 34, "#555555");

  return {
    version: 1,
    id: createId("blessing-rule"),
    pageId,
    titleText: result.titleText,
    bodyText: result.bodyText,
    signatureText: result.signatureText,
    activeBlessingId: result.activeBlessingId,
    activeSourceQuoteId: result.activeSourceQuoteId,
    templateId: result.templateId,
    backgroundFilename: result.backgroundFilename,
    frameEnabled: result.frameEnabled,
    frameFilename: result.frameFilename,
    titleTextStyle: titleStyle,
    bodyTextStyle: bodyStyle,
    signatureTextStyle: sigStyle,
    bodyAutoFitEnabled: true,
    bodyOverflowWarning: false,
    metadata: {}
  };
}

export function createBlessingModeDocument(
  name: string,
  result: BlessingWizardResult,
  backgroundAsset: Asset | null,
  frameAsset: Asset | null
): Document {
  const assets: Asset[] = [];
  if (backgroundAsset) assets.push(backgroundAsset);
  if (frameAsset) assets.push(frameAsset);

  const page = createPage({ setup: result.pageSetup });
  const rule = createBlessingRule(page.id, result);
  const { updatedPage, updatedRule } = buildBlessingLayersOnPage(page, rule, backgroundAsset, frameAsset);
  const doc = createDocument({ name, pages: [updatedPage], metadata: { mode: "blessing" } });

  return { ...doc, assets, blessingRules: [updatedRule] };
}

export function syncBlessingToPage(
  page: Page,
  rule: BlessingRule,
  _doc: Document,
  backgroundAsset: Asset | null,
  frameAsset: Asset | null
): { page: Page; rule: BlessingRule } {
  const { updatedPage, updatedRule } = buildBlessingLayersOnPage(page, rule, backgroundAsset, frameAsset);
  return { page: updatedPage, rule: updatedRule };
}

export function getBlessingRule(doc: Document, ruleId: ID): BlessingRule | undefined {
  return doc.blessingRules.find((r) => r.id === ruleId);
}

export function getBlessingRuleForPage(doc: Document, pageId: ID): BlessingRule | undefined {
  return doc.blessingRules.find((r) => r.pageId === pageId);
}

export function isBlessingBackgroundLayer(layer: VisualLayer): boolean {
  return layer.metadata["blessingBackground"] === true;
}

export function isBlessingFrameLayer(layer: VisualLayer): boolean {
  return layer.metadata["blessingFrame"] === true;
}

export function getBlessingTextRole(layer: VisualLayer): "title" | "body" | "signature" | null {
  const role = layer.metadata["blessingTextRole"] as string | undefined;
  if (role === "title" || role === "body" || role === "signature") return role;
  return null;
}

export function updateBlessingTextInDoc(
  doc: Document,
  ruleId: ID,
  field: "titleText" | "bodyText" | "signatureText",
  text: string
): Document {
  const ruleIdx = doc.blessingRules.findIndex((r) => r.id === ruleId);
  if (ruleIdx < 0) return doc;
  const rule = { ...doc.blessingRules[ruleIdx], [field]: text };
  const blessingRules = doc.blessingRules.map((r, i) => (i === ruleIdx ? rule : r));
  const layerIdField = field === "titleText" ? "titleLayerId" : field === "bodyText" ? "bodyLayerId" : "signatureLayerId";
  const layerId = rule[layerIdField];
  if (!layerId) return { ...doc, blessingRules };

  const pages = doc.pages.map((p) => {
    if (p.id !== rule.pageId) return p;
    return { ...p, layers: p.layers.map((l) => (l.id === layerId && l.type === "text" ? { ...l, text } : l)) };
  });

  return { ...doc, blessingRules, pages };
}

export function applyBlessingSelectionToDoc(doc: Document, ruleId: ID, blessing: BlessingItem): Document {
  return updateBlessingTextInDoc(
    { ...doc, blessingRules: doc.blessingRules.map((r) => (r.id === ruleId ? { ...r, activeBlessingId: blessing.id } : r)) },
    ruleId,
    "bodyText",
    blessing.text
  );
}

export function applyBlessingSourceSelectionToDoc(doc: Document, ruleId: ID, quote: SourceQuoteItem): Document {
  return updateBlessingTextInDoc(
    { ...doc, blessingRules: doc.blessingRules.map((r) => (r.id === ruleId ? { ...r, activeSourceQuoteId: quote.id } : r)) },
    ruleId,
    "bodyText",
    quote.text
  );
}

export function setBlessingComputedFontSizeInDoc(
  doc: Document,
  ruleId: ID,
  fontSize: number,
  overflows: boolean
): Document {
  const blessingRules = doc.blessingRules.map((r) => (r.id === ruleId ? { ...r, bodyFontSizeComputed: fontSize, bodyOverflowWarning: overflows } : r));
  const rule = blessingRules.find((r) => r.id === ruleId);
  if (!rule?.bodyLayerId) return { ...doc, blessingRules };
  const pages = doc.pages.map((p) => {
    if (p.id !== rule.pageId) return p;
    return { ...p, layers: p.layers.map((l) => (l.id === rule.bodyLayerId && l.type === "text" ? { ...l, fontSize } : l)) };
  });
  return { ...doc, blessingRules, pages };
}

export function updateBlessingTextStyleInDoc(
  doc: Document,
  ruleId: ID,
  target: "title" | "body" | "signature",
  stylePatch: Partial<TextStyle>
): Document {
  const ruleIdx = doc.blessingRules.findIndex((r) => r.id === ruleId);
  if (ruleIdx < 0) return doc;
  const old = doc.blessingRules[ruleIdx];
  const styleKey = `${target}TextStyle` as "titleTextStyle" | "bodyTextStyle" | "signatureTextStyle";
  const updatedRule = { ...old, [styleKey]: { ...old[styleKey], ...stylePatch } };
  const blessingRules = doc.blessingRules.map((r, i) => (i === ruleIdx ? updatedRule : r));
  const layerIdField = target === "title" ? "titleLayerId" : target === "body" ? "bodyLayerId" : "signatureLayerId";
  const layerId = updatedRule[layerIdField];
  if (!layerId) return { ...doc, blessingRules };

  const pages = doc.pages.map((p) => {
    if (p.id !== updatedRule.pageId) return p;
    return {
      ...p,
      layers: p.layers.map((l) => {
        if (l.id !== layerId || l.type !== "text") return l;
        return {
          ...l,
          ...(stylePatch.fontFamily !== undefined ? { fontFamily: stylePatch.fontFamily } : {}),
          ...(stylePatch.fontWeight !== undefined ? { fontWeight: stylePatch.fontWeight } : {}),
          ...(stylePatch.fontSize !== undefined ? { fontSize: stylePatch.fontSize } : {}),
          ...(stylePatch.color !== undefined ? { color: stylePatch.color } : {}),
          ...(stylePatch.alignment !== undefined ? { alignment: stylePatch.alignment } : {})
        };
      })
    };
  });
  return { ...doc, blessingRules, pages };
}

export function getBlessingTemplates() {
  return BLESSING_TEMPLATES;
}

export type { BlessingTemplateId };
