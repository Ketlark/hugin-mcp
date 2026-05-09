/**
 * SearXNG search client — aggregates 70+ engines via local Docker instance.
 */

import { robustFetch } from "../fetcher.js";
import { safeHostname } from "../html.js";
import { config } from "../config.js";

export async function searchSearXNG(query, opts = {}) {
  const { count = 10, categories, language, timeRange, pageno = 1, engines } = opts;
  const params = new URLSearchParams({ q: query, format: "json", pageno: String(pageno) });
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
  const results = (data.results || []).filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  }).slice(0, count).map((r) => ({
    title: r.title, url: r.url, snippet: r.content || "",
    domain: safeHostname(r.url), engine: r.engine,
    engines: r.engines || [], score: r.score, category: r.category,
    publishedDate: r.publishedDate || null,
  }));

  return {
    results, query: data.query, numberOfResults: data.number_of_results,
    suggestions: data.suggestions || [],
    infoboxes: (data.infoboxes || []).map((ib) => ({
      title: ib.infobox, content: ib.content, source: ib.engine,
    })),
    answers: (data.answers || []).map((a) => ({ answer: a.answer, engine: a.engine })),
    corrections: data.corrections || [],
    page: pageno,
  };
}

export async function ensureSearXNG() {
  try {
    return (await fetch(`${config.searxngUrl}/healthz`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch { return false; }
}

export async function startSearXNG() {
  const { execSync } = await import("child_process");
  try {
    console.error("🐳 Starting SearXNG...");
    execSync("docker compose up -d", { cwd: config.root, stdio: "pipe" });
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        if ((await fetch(`${config.searxngUrl}/healthz`, { signal: AbortSignal.timeout(1000) })).ok) return true;
      } catch {}
    }
    return false;
  } catch (e) {
    console.error(`⚠️ SearXNG: ${e.message}`);
    return false;
  }
}
