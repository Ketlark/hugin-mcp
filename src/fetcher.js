/**
 * Network fetch utilities — robustFetch (retry, timeout) + Puppeteer headless browser.
 */

import puppeteer from "puppeteer-core";
import { config } from "./config.js";

// ============================================================================
// robustFetch — retry + timeout + rate-limit handling
// ============================================================================

export async function robustFetch(url, opts = {}) {
  const { retries = 2, timeout = 15000, ...fetchOpts } = opts;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, { ...fetchOpts, signal: AbortSignal.timeout(timeout) });
      if (r.status === 429 && attempt < retries) {
        const delay = parseInt(r.headers.get("retry-after") || "2") * 1000;
        console.error(`   Rate limited, retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }
      return r;
    } catch (e) {
      if (attempt === retries) throw e;
      console.error(`   Retry ${attempt + 1}/${retries}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
}

export const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*",
  "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
};

// ============================================================================
// Puppeteer — singleton browser instance, page fetch with cookie dismissal
// ============================================================================

let browserInstance = null;
let browserLaunching = null;

/**
 * Pre-warm the browser at startup so first Puppeteer request is fast.
 */
export async function warmBrowser() {
  if (!config.chromePath) {
    console.error("   ⚠️  No Chrome/Chromium found — set CHROME_PATH to enable Puppeteer");
    return;
  }
  const b = await getBrowser();
  if (b) console.error("   ✅ Puppeteer warmed up");
  else console.error(`   ⚠️  Puppeteer failed — ${config.chromePath}`);
}

async function getBrowser() {
  if (!config.chromePath) return null;
  if (browserInstance?.connected) return browserInstance;
  if (browserLaunching) return browserLaunching;
  browserLaunching = puppeteer.launch({
    executablePath: config.chromePath,
    headless: true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu",
      "--disable-dev-shm-usage", "--disable-extensions", "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
      "--no-first-run", "--disable-default-apps", "--disable-sync",
    ],
  }).then((b) => {
    browserInstance = b;
    b.on("disconnected", () => { browserInstance = null; browserLaunching = null; });
    browserLaunching = null;
    return b;
  }).catch((e) => {
    console.error(`   ⚠️ Puppeteer launch failed: ${e.message}`);
    browserLaunching = null;
    return null;
  });
  return browserLaunching;
}

const COOKIE_BANNER_SELECTORS = [
  "#onetrust-accept-btn-handler", ".js-accept-cookies",
  "button[data-cc-action=accept]", "button[aria-label*=Accept]",
  ".cookie-consent-accept", "#accept-cookies",
  "button[data-testid=\"reject-all\"][class*=\"button\"]",
  "button[id*=\"reject\"]", "button[class*=\"reject\"]",
  "[class*=\"consent-accept\"]", "[class*=\"cookie-accept\"]",
  "[class*=\"accept-all\"]", "[class*=\"agree-btn\"]",
  "#onetrust-reject-all-handler",
  ".qc-cmp-button[mode=\"primary\"]",
];

export async function fetchWithPuppeteer(url) {
  const browser = await getBrowser();
  if (!browser) return null;

  const page = await browser.newPage();
  try {
    await page.setUserAgent(BROWSER_HEADERS["User-Agent"]);
    await page.setRequestInterception(true);
    // Block heavy resources
    page.on("request", (req) => {
      const type = req.resourceType();
      if (["image", "font", "media", "stylesheet"].includes(type)) req.abort();
      else req.continue();
    });

    const t0 = Date.now();
    await page.goto(url, { waitUntil: "networkidle2", timeout: config.puppeteerTimeout });
    await new Promise((r) => setTimeout(r, 1500));

    // Dismiss cookie banners
    for (const selector of COOKIE_BANNER_SELECTORS) {
      try { await page.click(selector, { timeout: 300 }); await new Promise((r) => setTimeout(r, 300)); } catch {}
    }
    await new Promise((r) => setTimeout(r, 1000));

    const html = await page.content();
    console.error(`   Puppeteer: ${(Date.now() - t0)}ms, ${html.length} chars`);
    return html;
  } catch (e) {
    console.error(`   Puppeteer failed: ${e.message}`);
    return null;
  } finally {
    await page.close();
  }
}
