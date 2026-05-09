/**
 * Wikipedia cleanup — strips navboxes, infobox tables, reference links, and
 * citation markers. Reduces 150k chars → ~5-10k chars of actual content.
 */

import { htmlToMarkdown } from "../html.js";
import { config } from "../config.js";

/**
 * Clean Wikipedia-specific HTML artifacts from markdown produced by Turndown.
 * Called as a post-processing step after htmlToMarkdown.
 */
export function cleanWikipediaMarkdown(md) {
  // Remove citation markers like [1], [note 1], [2][3]
  md = md.replace(/\[\d+\]/g, "");
  md = md.replace(/\[note \d+\]/g, "");
  md = md.replace(/\[citation needed\]/gi, "");

  // Remove image-only lines (Wikipedia is full of them)
  md = md.replace(/^\s*!\[.*?\]\(.*?\)\s*$/gm, "");

  // Remove empty bold headers from infobox (e.g. lines that are just "| **text** |")
  md = md.replace(/^\s*\|?\s*\*\*[^*]*\*\*\s*\|?\s*$/gm, "");

  // Collapse multiple blank lines
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

/**
 * Check if a URL is a Wikipedia article.
 */
export function isWikipedia(url) {
  try {
    const h = new URL(url).hostname;
    return h.endsWith(".wikipedia.org");
  } catch { return false; }
}

/**
 * Extract Wikipedia sections using the MediaWiki API.
 * Returns clean markdown, much shorter than full-page scraping.
 */
export async function fetchWikipediaSections(url) {
  try {
    const u = new URL(url);
    const lang = u.hostname.split(".")[0];
    const title = decodeURIComponent(u.pathname.replace("/wiki/", ""));
    if (!title) return null;

    // Use action=parse to get structured sections
    const apiUrl = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: "parse",
      page: title,
      prop: "sections|text",
      format: "json",
      redirects: "1",
      disabletoc: "1",
    });

    const r = await fetch(apiUrl, {
      headers: { "User-Agent": `Hugin/${config.version}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.parse) return null;

    const fullTitle = data.parse.title;
    const html = data.parse.text?.["*"] || "";
    if (!html) return null;

    // Strip style blocks, infoboxes, navboxes, sidebars, reference markers
    const cleaned = html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<table[^>]*class="[^"]*infobox[^"]*"[^>]*>[\s\S]*?<\/table>/gi, "")
      .replace(/<table[^>]*class="[^"]*navbox[^"]*"[^>]*>[\s\S]*?<\/table>/gi, "")
      .replace(/<table[^>]*class="[^"]*sidebar[^"]*"[^>]*>[\s\S]*?<\/table>/gi, "")
      .replace(/<table[^>]*class="[^"]*ambox[^"]*"[^>]*>[\s\S]*?<\/table>/gi, "")
      .replace(/<sup[^>]*class="[^"]*reference[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, "")
      .replace(/<span[^>]*class="[^"]*mw-editsection[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
      .replace(/<div[^>]*class="[^"]*hatnote[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<div[^>]*id="toc"[^>]*>[\s\S]*?<\/div>/gi, "");

    let md = htmlToMarkdown(cleaned);
    md = cleanWikipediaMarkdown(md);

    console.error(`   Wikipedia API: ${fullTitle} → ${md.length} chars`);
    return {
      title: fullTitle,
      description: `Wikipedia article (${lang})`,
      content: `# ${fullTitle}\n\n${md}`,
      source: "wikipedia-api",
    };
  } catch (e) {
    console.error(`   Wikipedia API failed: ${e.message}`);
    return null;
  }
}
