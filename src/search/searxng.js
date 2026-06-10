/**
 * SearXNG search client — aggregates 70+ engines via local Docker instance.
 */

import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { robustFetch } from "../fetcher.js";
import { safeHostname } from "../html.js";

// ---------------------------------------------------------------------------
// Docker & SearXNG lifecycle
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Check if docker CLI exists and the daemon is running.
 */
export function checkDocker() {
  try {
    execSync("docker info", { stdio: "pipe" });
    return { ok: true };
  } catch (e) {
    const msg = e.stderr?.toString() || e.message;
    if (msg.includes("not found") || msg.includes("no such file") || msg.includes("command not found")) {
      return { ok: false, reason: "not_installed" };
    }
    if (msg.includes("Is the docker daemon running") || msg.includes("Cannot connect to the Docker daemon")) {
      return { ok: false, reason: "not_running" };
    }
    return { ok: false, reason: "error", message: msg.slice(0, 200) };
  }
}

/**
 * Ensure docker-compose.yml and searxng-settings.yml exist in config.root.
 * Copies from package root if missing (handles npx install).
 */
function ensureComposeFiles() {
  const composeSrc = join(config.root, "docker-compose.yml");
  const settingsSrc = join(config.root, "searxng-settings.yml");
  const composeDst = composeSrc;
  const settingsDst = settingsSrc;

  if (existsSync(composeDst) && existsSync(settingsDst)) return;

  // If running from npx, config.root is the npx cache. Files should be there.
  // If they're missing (edge case), generate them.
  if (!existsSync(composeDst)) {
    const port = process.env.HUGIN_SEARXNG_PORT || "8888";
    writeFileSync(
      composeDst,
      `services:
  searxng:
    image: searxng/searxng:latest
    container_name: hugin-mcp-searxng
    ports:
      - "${port}:8080"
    volumes:
      - ./searxng-settings.yml:/etc/searxng/settings.yml:ro
    restart: unless-stopped
`,
    );
  }
  if (!existsSync(settingsDst)) {
    writeFileSync(
      settingsDst,
      `use_default_settings: true

search:
  safe_search: 0
  autocomplete: ""
  default_lang: "auto"
  formats:
    - html
    - json

server:
  secret_key: "hugin-mcp-local-notsecret"
  limiter: false
  public_instance: false
  bind_address: "0.0.0.0"
  port: 8080

ui:
  static_use_hash: true

outgoing:
  request_timeout: 10
`,
    );
  }
}

export async function ensureSearXNG() {
  try {
    const r = await fetch(`${config.searxngUrl}/healthz`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Start SearXNG via docker compose. Returns true if SearXNG is reachable after.
 * Reports clear status to stderr.
 */
export async function startSearXNG() {
  const docker = checkDocker();

  if (!docker.ok) {
    if (docker.reason === "not_installed") {
      console.error("   Docker is not installed. Install it: https://docs.docker.com/get-docker/");
    } else if (docker.reason === "not_running") {
      console.error("   Docker is installed but not running. Start Docker Desktop or the Docker daemon.");
    } else {
      console.error(`   Docker check failed: ${docker.message}`);
    }
    return false;
  }

  try {
    ensureComposeFiles();
    console.error("   Starting SearXNG container...");
    execSync("docker compose up -d", { cwd: config.root, stdio: "pipe" });

    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const r = await fetch(`${config.searxngUrl}/healthz`, { signal: AbortSignal.timeout(1000) });
        if (r.ok) {
          console.error("   SearXNG ready");
          return true;
        }
      } catch {
        /* still starting */
      }
    }
    console.error("   SearXNG container started but health check timed out after 15s");
    return false;
  } catch (e) {
    console.error(`   Failed to start SearXNG: ${e.message}`);
    return false;
  }
}

/**
 * Full SearXNG readiness check with auto-start.
 * Returns { available, reason } for clear reporting.
 */
export async function ensureSearXNGReady() {
  // Already running?
  if (await ensureSearXNG()) return { available: true, reason: "already_running" };

  // Try to start
  const started = await startSearXNG();
  if (started) return { available: true, reason: "auto_started" };

  const docker = checkDocker();
  if (!docker.ok) {
    return { available: false, reason: docker.reason };
  }
  return { available: false, reason: "container_failed" };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchSearXNG(query, opts = {}) {
  const { count = 10, categories, language, timeRange, pageno = 1, engines, domains, filetype } = opts;

  // Build effective query with domain filters and filetype
  let effectiveQuery = query;
  if (domains?.length) {
    // Sanitize: keep only valid hostname characters
    const safe = domains.map((d) => d.replace(/[^a-zA-Z0-9._-]/g, "")).filter(Boolean);
    if (safe.length) {
      const domainClauses = safe.map((d) => `site:${d}`).join(" OR ");
      effectiveQuery = safe.length === 1 ? `${query} site:${safe[0]}` : `${query} (${domainClauses})`;
    }
  }
  if (filetype) {
    const safeType = filetype.replace(/[^a-zA-Z0-9]/g, "");
    if (safeType) effectiveQuery += ` filetype:${safeType}`;
  }

  const params = new URLSearchParams({ q: effectiveQuery, format: "json", pageno: String(pageno) });
  if (count) params.set("limit", String(Math.min(count, 20)));
  if (categories) params.set("categories", categories);
  if (language) params.set("language", language);
  if (timeRange) params.set("time_range", timeRange);
  if (engines) params.set("engines", engines);

  const r = await robustFetch(`${config.searxngUrl}/search?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`SearXNG ${r.status}`);
  const data = await r.json();

  // Deduplicate by URL
  const seen = new Set();
  const results = (data.results || [])
    .filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    })
    .slice(0, count)
    .map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content || "",
      domain: safeHostname(r.url),
      engine: r.engine,
      engines: r.engines || [],
      score: r.score,
      category: r.category,
      publishedDate: r.publishedDate || null,
    }));

  return {
    results,
    query: data.query,
    numberOfResults: data.number_of_results,
    suggestions: data.suggestions || [],
    infoboxes: (data.infoboxes || []).map((ib) => ({
      title: ib.infobox,
      content: ib.content,
      source: ib.engine,
    })),
    answers: (data.answers || []).map((a) => ({ answer: a.answer, engine: a.engine })),
    corrections: data.corrections || [],
    page: pageno,
  };
}
