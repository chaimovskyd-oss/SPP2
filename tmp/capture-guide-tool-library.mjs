import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:5173/";
const outDir = path.resolve("output/playwright/guide-mapping/screenshots");
const sampleImage = path.resolve("tmp/guide-sample-image.png");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
await mkdir(outDir, { recursive: true });

async function settle(ms = 900) {
  await page.waitForTimeout(ms);
  await page.addStyleTag({
    content: `[role="status"], .ai-preload-chip, .ai-preload-splash { pointer-events: none !important; opacity: 0 !important; }`
  }).catch(() => {});
}

await page.goto(baseUrl);
await settle();
await page.getByTestId("mode-free").click();
await settle();
await page.getByTestId("create-document").click();
await page.getByTestId("editor-screen").waitFor({ state: "visible", timeout: 15000 });
await settle(1200);
await page.getByTestId("tool-image").click();
await settle(250);
await page.locator("input[type=file][accept*='image']").first().setInputFiles(sampleImage);
await settle(2200);

await page.locator(".layer-add-btn").click();
await settle(300);
await page.locator(".layer-add-popover button").nth(3).click();
await settle(1600);
await page.screenshot({ path: path.join(outDir, "37-editor-tool-library.png"), fullPage: false });

console.log(JSON.stringify({ outDir, ok: true }, null, 2));
await browser.close();
