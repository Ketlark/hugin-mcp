/**
 * Bing search fallback — HTML scraping when SearXNG is unavailable.
 */

import { robustFetch } from "../fetcher.js";
import { stripTags, decodeHTMLEntities, safeHostname } from "../html.js";

export async function searchBing(query, opts = {}) {
  const { count = 10 } = opts;
  const r = await robustFetch(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${Math.min(count, 20)}`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
      },
    }
  );
  if (!r.ok) throw new Error(`Bing ${r.status}`);
  const html = await r.text();
  const results = [];
  const blocks = html.split('class="b_algo"');
  for (let i = 1; i < blocks.length && results.length < count; i++) {
    const block = blocks[i];
    const tm = block.match(/<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const sm = block.match(/class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    if (tm) {
      let u = tm[1];
      if (u.includes("bing.com/ck/a")) {
        try {
          const p = new URL(u.replace(/&amp;/g, "&")).searchParams.get("u");
          if (p?.startsWith("a1")) u = Buffer.from(p.substring(2), "base64").toString("utf-8");
        } catch {}
      }
      results.push({
        title: decodeHTMLEntities(stripTags(tm[2])).trim(),
        url: u,
        snippet: sm ? decodeHTMLEntities(stripTags(sm[1])).trim() : "",
        domain: safeHostname(u),
        engine: "bing",
      });
    }
  }
  return {
    results, query, numberOfResults: results.length,
    suggestions: [], infoboxes: [], answers: [], corrections: [], page: 1,
  };
}
