import { chromium } from "playwright";
import path from "node:path";

const filePath = path.resolve("docs/guide-mapping/spp2-user-guide-he.html");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
await page.goto(`file:///${filePath.replace(/\\/g, "/")}`);
await page.waitForLoadState("domcontentloaded");
await page.waitForTimeout(500);
const info = await page.evaluate(() => {
  const base = document.body.textContent || "";
  return {
    includesCropEn: base.toLowerCase().includes("crop"),
    includesCropHe: base.includes("קרופ"),
    includesHituch: base.includes("חיתוך"),
    imageEditSearch: document.querySelector("#image-edit")?.getAttribute("data-search"),
    buttonDetailsSearch: document.querySelector("#button-details")?.getAttribute("data-search"),
    bodySample: base.slice(base.indexOf("Crop") - 40, base.indexOf("Crop") + 80)
  };
});
console.log(JSON.stringify(info, null, 2));
await page.locator("#search").fill("קרופ");
await page.waitForTimeout(250);
const after = await page.evaluate(() => ({
  value: document.querySelector("#search")?.value,
  resultHtml: document.querySelector("#searchResults")?.innerHTML,
  hiddenCount: document.querySelectorAll(".hidden-by-search").length,
  visibleSearchable: Array.from(document.querySelectorAll(".searchable:not(.hidden-by-search)")).slice(0, 5).map((el) => ({
    id: el.id,
    text: (el.querySelector("h1,h2,h3,strong")?.textContent || el.textContent || "").trim().slice(0, 80),
    data: el.getAttribute("data-search")
  }))
}));
console.log(JSON.stringify(after, null, 2));
await browser.close();
