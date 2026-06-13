import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:5173/";
const outDir = path.resolve("output/playwright/guide-mapping/screenshots");
const sampleImage = path.resolve("tmp/guide-sample-image.png");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
await mkdir(outDir, { recursive: true });

async function settle(ms = 800) {
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
  await page.addStyleTag({
    content: `[role="status"], .ai-preload-chip, .ai-preload-splash { pointer-events: none !important; opacity: 0 !important; }`
  }).catch(() => {});
}

async function screenshot(name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
}

async function createFreeDocument() {
  await page.goto(baseUrl);
  await settle();
  await page.getByTestId("mode-free").click();
  await settle();
  await page.getByTestId("create-document").click();
  await page.getByTestId("editor-screen").waitFor({ state: "visible", timeout: 15000 });
  await settle(1200);
}

async function selectFirstLayerFromList(nameHint) {
  const candidates = page.locator(".layers-panel button, .layer-row, [data-testid*='layer']");
  const count = await candidates.count().catch(() => 0);
  if (count > 0) {
    if (nameHint) {
      const named = page.getByText(nameHint, { exact: false });
      if (await named.count().catch(() => 0)) {
        await named.first().click({ force: true }).catch(() => {});
        await settle();
        return;
      }
    }
    await candidates.first().click({ force: true }).catch(() => {});
    await settle();
  }
}

await createFreeDocument();
await screenshot("30-editor-empty");

await page.getByTestId("tool-text").click();
await settle();
await screenshot("31-editor-text-selected");

await createFreeDocument();
await page.getByTestId("tool-image").click();
await settle(300);
const imageInputs = page.locator("input[type=file][accept*='image']");
const imageInputCount = await imageInputs.count();
if (imageInputCount > 0) {
  await imageInputs.first().setInputFiles(sampleImage);
  await settle(2200);
} else {
  const fileInputs = page.locator("input[type=file]");
  const fileInputCount = await fileInputs.count();
  if (fileInputCount > 0) await fileInputs.first().setInputFiles(sampleImage);
  await settle(1600);
}
await screenshot("32-editor-image-imported");

await selectFirstLayerFromList("guide-sample");
await screenshot("33-editor-image-selected");

const editButton = page.getByTitle("עריכת תמונה — קרופ, מחיקה, שרביט קסם");
if (await editButton.count().catch(() => 0)) {
  await editButton.first().click({ force: true });
  await settle();
  await screenshot("34-editor-image-edit-toolbar");

  const brush = page.getByTitle("מכחול סימון");
  if (await brush.count().catch(() => 0)) {
    await brush.first().click({ force: true });
    await settle();
    await screenshot("35-editor-image-edit-brush-select");
  }

  const crop = page.getByTitle("Crop");
  if (await crop.count().catch(() => 0)) {
    await crop.first().click({ force: true });
    await settle();
    await screenshot("36-editor-image-edit-crop");
  }
}

const toolLibraryButtons = [
  page.getByText("ספריית כלים", { exact: false }),
  page.getByText("AI FX", { exact: false }),
  page.getByTitle("ספריית אפקטים AI"),
];
for (const locator of toolLibraryButtons) {
  const count = await locator.count().catch(() => 0);
  if (count > 0) {
    await locator.first().click({ force: true }).catch(() => {});
    await settle(1600);
    await screenshot("37-editor-tool-library-or-ai-fx");
    break;
  }
}

console.log(JSON.stringify({ outDir, ok: true }, null, 2));
await browser.close();
