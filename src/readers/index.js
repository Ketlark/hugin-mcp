/**
 * Reader router — dispatches URLs to the correct specialized reader,
 * falls back to the generic Readability+Puppeteer pipeline.
 *
 * Each specialized reader exports: canHandle(url) → boolean, read(url, opts) → Result|null
 * A reader returning { rewrite: newUrl } triggers a URL rewrite instead of direct handling.
 */

import { getCached, setCache } from "../cache.js";
import { config } from "../config.js";
import { BROWSER_HEADERS, fetchWithPuppeteer, robustFetch } from "../fetcher.js";
import { cleanHTML, extractArticle, extractImages, extractLinks, extractMetadata, htmlToMarkdown } from "../html.js";
import { readerLMConvert } from "../llm.js";
import * as arxiv from "./arxiv.js";
import * as dockerhub from "./dockerhub.js";
// --- Specialized readers (ordered by priority) ---
import * as github from "./github.js";
import * as hackernews from "./hackernews.js";
import * as mdn from "./mdn.js";
import * as npm from "./npm.js";
import * as pdf from "./pdf.js";
import * as reddit from "./reddit.js";
import * as stackexchange from "./stackexchange.js";
import { fetchWikipediaSections, isWikipedia } from "./wikipedia.js";
import * as youtube from "./youtube.js";

const SPECIALIZED_READERS = [github, reddit, youtube, hackernews, stackexchange, pdf, arxiv, mdn, npm, dockerhub];

// ============================================================================
// Public API
// ============================================================================

/**
 * Read a web page, using the best available strategy.
 * @param {string} url
 * @param {object} opts — { format, llm, withLinksSummary, withImagesSummary, maxLength }
 * @returns {Promise<{url, title, description, content, format, source, linksSummary?, imagesSummary?}>}
 */
export async function readPage(url, opts = {}) {
  const {
    format = "markdown",
    llm = false,
    withLinksSummary = false,
    withImagesSummary = false,
    maxLength = null,
  } = opts;

  // Check cache first
  const cacheKey = `read:${url}:${format}:${llm}:${maxLength || "none"}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.error(`   Cache HIT: ${url}`);
    return cached;
  }

  // 1) Wikipedia: use MediaWiki API for clean output (before generic readers)
  if (isWikipedia(url)) {
    const wikiResult = await fetchWikipediaSections(url);
    if (wikiResult) {
      if (maxLength && wikiResult.content.length > maxLength)
        wikiResult.content = `${wikiResult.content.substring(0, maxLength)}\n\n[... truncated]`;
      const page = {
        url,
        ...wikiResult,
        format,
        linksSummary: withLinksSummary ? extractLinks(wikiResult.content) : undefined,
      };
      setCache(cacheKey, page);
      return page;
    }
    // If API fails, fall through to generic pipeline
  }

  // 2) Try specialized readers
  for (const reader of SPECIALIZED_READERS) {
    if (reader.canHandle(url)) {
      const result = await reader.read(url, opts);
      if (!result) continue; // reader declined, try next

      // URL rewrite (e.g. Reddit subreddit → old.reddit.com)
      if (result.rewrite) {
        url = result.rewrite;
        break; // fall through to generic pipeline with rewritten URL
      }

      // Direct result from specialized reader
      if (maxLength && result.content.length > maxLength)
        result.content = `${result.content.substring(0, maxLength)}\n\n[... truncated]`;
      const page = {
        url,
        ...result,
        format,
        linksSummary: withLinksSummary ? extractLinks(result.content) : undefined,
      };
      setCache(cacheKey, page);
      return page;
    }
  }

  // 3) PDF detection by Content-Type (for URLs that don't end in .pdf)
  // Handled later after we see the response headers

  // 4) Generic pipeline: fetch → Readability → Puppeteer fallback
  return await genericRead(url, { format, llm, withLinksSummary, withImagesSummary, maxLength, cacheKey });
}

// ============================================================================
// Generic reader pipeline
// ============================================================================

async function genericRead(url, opts) {
  const { format, llm, withLinksSummary, withImagesSummary, maxLength, cacheKey } = opts;

  // Fetch
  let response;
  let fetchFailed = false;
  try {
    response = await robustFetch(url, { timeout: 20000, headers: BROWSER_HEADERS });
    if (!response.ok) fetchFailed = true;
  } catch {
    fetchFailed = true;
  }

  // If fetch failed, try Puppeteer directly
  if (fetchFailed) {
    const puppeteerResult = await readViaPuppeteer(url, opts);
    if (puppeteerResult) {
      setCache(cacheKey, puppeteerResult);
      return puppeteerResult;
    }
    throw new Error(`Failed to fetch ${url}: ${response?.status || "network error"} and Puppeteer fallback failed`);
  }

  const contentType = response.headers.get("content-type") || "";
  const rawHTML = await response.text();

  // Non-HTML (text, JSON, etc.)
  if (!contentType.includes("html") && !contentType.includes("xml")) {
    let content = rawHTML;
    if (maxLength && content.length > maxLength) content = `${content.substring(0, maxLength)}\n\n[... truncated]`;
    const result = { url, title: "", description: "", content, format: "text", source: "native-fetch" };
    setCache(cacheKey, result);
    return result;
  }

  // Clean + metadata
  const cleaned = cleanHTML(rawHTML);
  const meta = extractMetadata(rawHTML);

  // Readability
  let article = extractArticle(cleaned, url);
  let usedPuppeteer = false;

  if (!article || article.textContent.trim().length < config.readabilityMinChars) {
    console.error(`   Readability: too short (${article?.textContent?.trim().length || 0} chars), trying Puppeteer...`);
    const puppeteerHTML = await fetchWithPuppeteer(url);
    if (puppeteerHTML) {
      const puppeteerArticle = extractArticle(cleanHTML(puppeteerHTML), url);
      if (puppeteerArticle && puppeteerArticle.textContent.trim().length >= config.readabilityMinChars) {
        article = puppeteerArticle;
        usedPuppeteer = true;
        console.error(`   Puppeteer+Readability: ${article.textContent.trim().length} chars ✅`);
      }
    }
  }

  if (!article || article.textContent.trim().length < 50) {
    let content = htmlToMarkdown(cleaned);
    if (maxLength && content.length > maxLength) content = `${content.substring(0, maxLength)}\n\n[... truncated]`;
    const result = {
      url,
      title: meta.ogTitle || meta.title,
      description: meta.description,
      content,
      format,
      source: "turndown-raw",
    };
    setCache(cacheKey, result);
    return result;
  }

  const title = meta.ogTitle || article.title || meta.title;
  const description = meta.description || article.excerpt || article.byline || "";

  let content, source;
  if (llm) {
    const llmResult = await readerLMConvert(article.contentHTML);
    if (llmResult) {
      content = llmResult;
      source = "readerlm-v2";
    } else {
      content = htmlToMarkdown(article.contentHTML);
      source = "readability";
    }
  } else {
    content = htmlToMarkdown(article.contentHTML);
    source = usedPuppeteer ? "puppeteer+readability" : "readability";
    console.error(`   ${source}: ${article.contentHTML.length} chars → ${content.length} chars`);
  }

  if (maxLength && content.length > maxLength) content = `${content.substring(0, maxLength)}\n\n[... truncated]`;

  const result = {
    url,
    title,
    description,
    content,
    format,
    source,
    linksSummary: withLinksSummary ? extractLinks(content) : undefined,
    imagesSummary: withImagesSummary ? extractImages(content) : undefined,
  };
  setCache(cacheKey, result);
  return result;
}

async function readViaPuppeteer(url, opts) {
  const { format, llm, maxLength } = opts;
  const html = await fetchWithPuppeteer(url);
  if (!html) return null;

  const cleaned = cleanHTML(html);
  const meta = extractMetadata(html);
  const article = extractArticle(cleaned, url);
  if (!article || article.textContent.trim().length < config.readabilityMinChars) return null;

  console.error(`   Puppeteer+Readability: ${article.textContent.trim().length} chars ✅`);
  let content = llm
    ? (await readerLMConvert(article.contentHTML)) || htmlToMarkdown(article.contentHTML)
    : htmlToMarkdown(article.contentHTML);
  const source = llm ? "puppeteer+readerlm-v2" : "puppeteer+readability";
  if (maxLength && content.length > maxLength) content = `${content.substring(0, maxLength)}\n\n[... truncated]`;
  return {
    url,
    title: meta.ogTitle || article.title || meta.title,
    description: meta.description || article.excerpt,
    content,
    format,
    source,
  };
}
