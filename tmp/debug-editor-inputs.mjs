import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });

await page.goto("http://127.0.0.1:5173/");
await page.waitForTimeout(800);
await page.getByTestId("mode-free").click();
await page.waitForTimeout(800);
await page.getByTestId("create-document").click();
await page.getByTestId("editor-screen").waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(1000);
await page.getByTestId("tool-image").click();
await page.waitForTimeout(500);

const inputs = await page.locator("input[type=file]").evaluateAll((els) => els.map((el, index) => ({
  index,
  accept: el.getAttribute("accept"),
  hidden: el.hidden,
  aria: el.getAttribute("aria-label"),
  classes: el.getAttribute("class"),
})));
console.log(JSON.stringify(inputs, null, 2));

await browser.close();
