import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:5173/";
const outDir = path.resolve("output/playwright/guide-mapping/screenshots");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
await mkdir(outDir, { recursive: true });

async function settle() {
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(900);
  await page.addStyleTag({
    content: `[role="status"], .ai-preload-chip, .ai-preload-splash { pointer-events: none !important; opacity: 0 !important; }`
  }).catch(() => {});
}

async function screenshot(name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
}

async function openFresh(url) {
  await page.goto(url);
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle();
}

await page.goto(baseUrl);
await settle();
await page.locator("header.topnav").getByRole("button", { name: "הגדרות", exact: true }).click();
await settle();
await screenshot("12-settings-window");

for (const [label, name] of [
  ["סביבת עבודה", "12b-settings-workspace"],
  ["קיצורי מקלדת", "12c-settings-shortcuts"],
  ["מראה", "12d-settings-appearance"],
  ["ביצועים", "12e-settings-performance"],
  ["קבצים ושמירה", "12f-settings-files"],
  ["ייצוא והדפסה", "12g-settings-export"],
  ["פספורט", "12h-settings-passport"],
  ["מתקדם", "12i-settings-advanced"],
]) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await settle();
  await screenshot(name);
}

await openFresh(`${baseUrl}?manual=smart-prepare#/window/smart-prepare`);
await screenshot("13-smart-print-prepare");

await openFresh(`${baseUrl}?manual=print-hub#print-hub`);
await screenshot("20-print-hub-standalone");

console.log(JSON.stringify({ outDir, ok: true }, null, 2));
await browser.close();
