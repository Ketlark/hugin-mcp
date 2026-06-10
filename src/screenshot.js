/**
 * Screenshot utility — capture a web page as base64 PNG/JPEG via Puppeteer.
 */

import { config } from "./config.js";
import { BROWSER_HEADERS, COOKIE_BANNER_SELECTORS, getBrowser } from "./fetcher.js";

/**
 * Capture a screenshot of a URL.
 * @param {string} url — URL to screenshot
 * @param {object} opts — { width, height, fullPage, format }
 * @returns {Promise<{ url, title, screenshot, format, width, height }>}
 */
export async function takeScreenshot(url, opts = {}) {
  const { width = 1280, height = 800, fullPage = false, format = "png" } = opts;

  const browser = await getBrowser();
  if (!browser) throw new Error("Puppeteer not available — install Chrome/Chromium and set CHROME_PATH");

  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setUserAgent(BROWSER_HEADERS["User-Agent"]);

    // Block fonts only — images/css are needed for accurate screenshots
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.resourceType() === "font") req.abort();
      else req.continue();
    });

    await page.goto(url, { waitUntil: "networkidle2", timeout: config.puppeteerTimeout });
    // Settle dynamic content
    await new Promise((r) => setTimeout(r, 1000));

    // Dismiss cookie banners (same selectors as fetcher)
    for (const selector of COOKIE_BANNER_SELECTORS) {
      try {
        await page.click(selector, { timeout: 300 });
        await new Promise((r) => setTimeout(r, 300));
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 500));

    const title = await page.title();

    const screenshotOpts = {
      encoding: "base64",
      type: format === "jpeg" ? "jpeg" : "png",
      fullPage,
    };
    if (format === "jpeg") screenshotOpts.quality = 80;

    const base64 = await page.screenshot(screenshotOpts);

    return {
      url,
      title,
      screenshot: base64,
      format: format === "jpeg" ? "jpeg" : "png",
      width,
      height,
      fullPage,
    };
  } finally {
    await page.close();
  }
}
