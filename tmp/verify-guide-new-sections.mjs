import { chromium } from "playwright";
import path from "node:path";

const filePath = path.resolve("docs/guide-mapping/spp2-user-guide-he.html");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
await page.goto(`file:///${filePath.replace(/\\/g, "/")}`);
await page.waitForLoadState("domcontentloaded");
await page.waitForTimeout(500);

const sections = [
  "guide-home",
  "annotated-tours",
  "save-export",
  "cloud-save",
  "print-tools",
  "class-photo-deep",
  "collage-deep",
  "batch-production-deep",
  "blessing-deep",
  "photo-print-deep",
  "mask-grid-product-pdf-deep"
];
const anchors = {};
for (const id of sections) {
  anchors[id] = await page.locator(`#${id}`).count();
}

const queries = [
  "דף הבית מדריך",
  "צילומים מסומנים",
  "שמירה בענן",
  "הדפס עותק אחד",
  "תלמיד צוות",
  "רווח אופקי",
  "פריסות קולאז",
  "תבניות ייצור",
  "ברכה מקורות",
  "פיתוח תמונות fit fill",
  "ספריית מוצרים safe area",
  "PDF סיבוב"
];
const results = [];
for (const query of queries) {
  await page.locator("#search").fill(query);
  await page.waitForTimeout(150);
  results.push({
    query,
    count: await page.locator(".search-result").count(),
    first: await page.locator(".search-result strong").first().textContent().catch(() => null)
  });
}

console.log(JSON.stringify({ anchors, results }, null, 2));
await browser.close();
