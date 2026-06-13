import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:5173/";
const outDir = path.resolve("output/playwright/guide-mapping/screenshots");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });

await mkdir(outDir, { recursive: true });

async function settle(extra = 700) {
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(extra);
}

async function screenshot(name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
}

async function home() {
  await page.goto(baseUrl);
  await settle();
}

const captures = [];
async function capture(name, action) {
  try {
    await action();
    await settle();
    await screenshot(name);
    captures.push({ name, ok: true, url: page.url() });
  } catch (error) {
    captures.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

await home();
await screenshot("01-home");

for (const [testId, name] of [
  ["mode-free", "02-mode-free-setup"],
  ["mode-grid", "03-mode-grid-setup"],
  ["mode-mask", "04-mode-mask-wizard"],
  ["mode-collage", "05-mode-collage-wizard"],
  ["mode-pdf_tools", "06-pdf-studio"],
  ["mode-class_photo", "07-class-photo-wizard"],
  ["mode-photo_print", "08-photo-print-wizard"],
  ["mode-product", "09-product-library"],
  ["mode-batch_production", "10-batch-production-library"],
  ["mode-blessing", "11-blessing-wizard"],
]) {
  await capture(name, async () => {
    await home();
    await page.getByTestId(testId).click();
  });
}

await capture("12-settings-window", async () => {
  await home();
  await page.getByRole("button", { name: "הגדרות" }).click();
});

for (const [label, name] of [
  ["ספריית מסיכות", "14-mask-library"],
  ["הסרת רקע כמותית", "15-batch-background-remove"],
  ["קודים ו-QR", "16-qr-generator"],
  ["קישורים מהירים", "17-quick-links"],
  ["חיפוש מהיר", "18-quick-search"],
  ["מרכז הדפסות", "19-print-hub"],
]) {
  await capture(name, async () => {
    await home();
    await page.getByText(label, { exact: true }).click();
  });
}

await capture("13-smart-print-prepare", async () => {
  await page.goto(`${baseUrl}#/window/smart-prepare`);
});

await capture("20-print-hub-standalone", async () => {
  await page.goto(`${baseUrl}#print-hub`);
});

console.log(JSON.stringify({ outDir, captures }, null, 2));
await browser.close();
