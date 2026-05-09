/**
 * HTML utilities — cleaning, stripping, Readability extraction, Turndown conversion.
 * Single responsibility: transform raw HTML into structured data / markdown.
 */

import { Readability } from "@mozilla/readability";
import turndown from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { JSDOM, VirtualConsole } from "jsdom";

// Silence JSDOM output
const quietConsole = new VirtualConsole();
quietConsole.on("error", () => {});
quietConsole.on("warn", () => {});
quietConsole.on("jsdomError", () => {});

// Shared Turndown instance with GFM support
const TD = new turndown({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
TD.use(gfm);

// ============================================================================
// Low-level string utilities
// ============================================================================

export function stripTags(html) {
  return html.replace(/<[^>]*>/g, "");
}

export function decodeHTMLEntities(text) {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCharCode(parseInt(c, 16)));
}

export function safeHostname(url) {
  try { return new URL(url).hostname; } catch { return ""; }
}

// ============================================================================
// HTML cleaning — remove boilerplate elements
// ============================================================================

export function cleanHTML(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<meta[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/gi, "")
    .replace(/<link[^>]*>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");
}

// ============================================================================
// Metadata extraction from raw HTML
// ============================================================================

export function extractMetadata(html) {
  return {
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "",
    description: html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i)?.[1]
      || html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/i)?.[1] || "",
    ogTitle: html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/i)?.[1] || "",
  };
}

// ============================================================================
// Readability — extract article content from HTML
// ============================================================================

export function extractArticle(html, url) {
  const dom = new JSDOM(html, { url, virtualConsole: quietConsole });
  const article = new Readability(dom.window.document, { charThreshold: 100 }).parse();
  dom.window.close();
  if (!article) return null;
  return {
    title: article.title || "",
    textContent: article.textContent || "",
    contentHTML: article.content || "",
    excerpt: article.excerpt || "",
    byline: article.byline || "",
  };
}

// ============================================================================
// Turndown — HTML → Markdown with post-processing
// ============================================================================

export function htmlToMarkdown(html) {
  let md = TD.turndown(html);
  // Clean link titles: [text](url "Title") → [text](url)
  md = md.replace(/\]\(([^)]+)\s+"[^"]*"\)/g, "]($1)");
  // Remove empty links: [](url) → nothing
  md = md.replace(/\[([^\]]*)\]\([^)]*\)/g, (match, text) => text.trim() ? match : text);
  // Collapse 3+ newlines → 2
  md = md.replace(/\n{3,}/g, "\n\n");
  return md.trim();
}

// ============================================================================
// Link / image extraction from markdown
// ============================================================================

export function extractLinks(md) {
  const links = [];
  const re = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(md)) !== null && links.length < 50)
    links.push({ text: m[1], href: m[2] });
  return links.length ? links : undefined;
}

export function extractImages(md) {
  const images = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(md)) !== null && images.length < 20)
    images.push({ alt: m[1], src: m[2] });
  return images.length ? images : undefined;
}
