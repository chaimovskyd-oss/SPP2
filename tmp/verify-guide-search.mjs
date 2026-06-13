import { chromium } from "playwright";
import path from "node:path";

const filePath = path.resolve("docs/guide-mapping/spp2-user-guide-he.html");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
await page.goto(`file:///${filePath.replace(/\\/g, "/")}`);
await page.waitForLoadState("domcontentloaded");
await page.waitForTimeout(500);

const queries = ["קרופ", "תמונה צהובה", "מילוי חכם", "dpi", "פריסט"];
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
console.log(JSON.stringify(results, null, 2));
await browser.close();
