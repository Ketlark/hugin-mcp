/**
 * Hugin — centralized configuration.
 * All env vars, defaults, and platform detection in one place.
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Platform-aware Chrome/Chromium detection
// ---------------------------------------------------------------------------

function findChrome() {
  // Explicit override
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const platform = process.platform;
  const candidates = {
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ],
    linux: [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/brave-browser",
      "/usr/bin/microsoft-edge",
      "/snap/bin/chromium",
    ],
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ].filter(Boolean),
  };

  for (const p of candidates[platform] || []) {
    if (existsSync(p)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const config = Object.freeze({
  name: "hugin-mcp",
  version: "1.0.0",

  // SearXNG
  searxngUrl: process.env.HUGIN_SEARXNG_URL || process.env.SEARXNG_URL || "http://localhost:8888",

  // LM Studio / ReaderLM (optional)
  lmstudioUrl: process.env.HUGIN_LMSTUDIO_URL || process.env.LMSTUDIO_URL || "http://localhost:1234",
  readerlmModel: process.env.HUGIN_READERLM_MODEL || process.env.READERLM_MODEL || "readerlm-v2-mlx",
  readerlmMaxInput: parseInt(process.env.HUGIN_READERLM_MAX_INPUT || process.env.READERLM_MAX_INPUT || "15000"),

  // Puppeteer
  chromePath: findChrome(),
  puppeteerTimeout: parseInt(process.env.HUGIN_PUPPETEER_TIMEOUT || process.env.PUPPETEER_TIMEOUT || "15000"),

  // Cache
  cacheDir: process.env.HUGIN_CACHE_DIR || process.env.CACHE_DIR || join(ROOT, ".cache"),
  cacheTtl: parseInt(process.env.HUGIN_CACHE_TTL || process.env.CACHE_TTL || "86400"), // 24h

  // Readability
  readabilityMinChars: parseInt(process.env.HUGIN_READABILITY_MIN_CHARS || "200"),

  // Project root (for docker-compose, etc.)
  root: ROOT,

  // Computed (not in the literal to avoid TDZ)
  get userAgent() { return `Hugin/${config.version}`; },
});
