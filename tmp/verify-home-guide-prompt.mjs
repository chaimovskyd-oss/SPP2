import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });

await page.goto("http://127.0.0.1:5173/");
await page.evaluate(() => {
  localStorage.removeItem("spp2-user-guide-never-prompt");
  sessionStorage.removeItem("spp2-user-guide-session-dismissed");
});
await page.reload();
await page.waitForLoadState("networkidle");

const promptTitle = page.getByRole("heading", { name: "חדש ב-SPP2?" });
await promptTitle.waitFor({ timeout: 10000 });

const promptVisible = await promptTitle.isVisible();
const enterGuideVisible = await page.getByRole("button", { name: /היכנס למדריך/ }).isVisible();
const laterVisible = await page.getByRole("button", { name: "לא כרגע" }).isVisible();
const neverVisible = await page.getByRole("button", { name: "אל תציע שוב" }).isVisible();

await page.getByRole("button", { name: "לא כרגע" }).click();
await promptTitle.waitFor({ state: "hidden", timeout: 5000 });

const guideButtonVisible = await page.getByRole("button", { name: /מדריך משתמש/ }).isVisible();
const guideResponse = await page.request.get("http://127.0.0.1:5173/docs/guide-mapping/spp2-user-guide-he.html");

console.log(JSON.stringify({
  promptVisible,
  enterGuideVisible,
  laterVisible,
  neverVisible,
  guideButtonVisible,
  guideStatus: guideResponse.status()
}, null, 2));

await browser.close();
