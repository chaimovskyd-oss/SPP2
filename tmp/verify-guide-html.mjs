import { chromium } from "playwright";
import path from "node:path";

const filePath = path.resolve("docs/guide-mapping/spp2-user-guide-he.html");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
await page.goto(`file:///${filePath.replace(/\\/g, "/")}`);
await page.waitForLoadState("domcontentloaded");
await page.waitForTimeout(1200);
const info = await page.evaluate(() => ({
  title: document.title,
  images: Array.from(document.images).length,
  brokenImages: Array.from(document.images).filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.getAttribute("src")),
  cards: document.querySelectorAll(".card").length,
  tabs: document.querySelectorAll(".tab").length
}));
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: path.resolve("output/playwright/guide-mapping/html-preview.png"), fullPage: false });
await browser.close();
