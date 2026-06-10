#!/usr/bin/env node

/**
 * Hugin — 100% local, 100% free MCP server for web search & reading.
 * Named after one of Odin's ravens: Hugin (thought) who flies out each
 * morning to explore the world and report back.
 *
 * All logic is in src/ modules. This file only wires the MCP server.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getCacheCount, getCached, setCache } from "./cache.js";
import { config } from "./config.js";
import { warmBrowser } from "./fetcher.js";
import { formatReadResponse, formatSearchResponse } from "./format.js";
import { checkReaderLM } from "./llm.js";
import { readPage } from "./readers/index.js";
import { takeScreenshot } from "./screenshot.js";
import { searchBing } from "./search/bing.js";
import { ensureSearXNGReady, searchSearXNG } from "./search/searxng.js";

// ============================================================================
// MCP Server
// ============================================================================

let searxngAvailable = false;

const server = new Server({ name: "hugin-mcp", version: config.version }, { capabilities: { tools: {} } });

// --- Tool definitions ---

// --- Shared schema definitions (DRY) ---

const SEARCH_PARAMS = {
  query: { type: "string", description: 'Search query (supports site:, "exact", -exclude)' },
  count: { type: "number", description: "Max results (1–20)", default: 10 },
  engine: { type: "string", enum: ["auto", "searxng", "bing"], default: "auto" },
  categories: { type: "string", description: "general, news, images, videos, it, science, music, files, social media" },
  language: { type: "string", description: "en, fr, de, es, ja, zh, etc." },
  time_range: { type: "string", enum: ["day", "month", "year"] },
  domains: {
    type: "array",
    items: { type: "string" },
    description: "Restrict search to these domains (e.g. ['github.com', 'stackoverflow.com'])",
  },
  filetype: { type: "string", description: "Restrict to file type (e.g. 'pdf', 'doc', 'ppt')" },
};

const CONTENT_PARAMS = {
  format: { type: "string", enum: ["markdown", "text"], default: "markdown" },
  max_length: { type: "number", description: "Max content chars per page" },
};

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "web_search",
      description:
        "Search the web using SearXNG (aggregates Google + Bing + 70 engines). " +
        "Cached 24h. Returns titles, URLs, snippets, direct answers, and infoboxes.",
      inputSchema: {
        type: "object",
        properties: {
          ...SEARCH_PARAMS,
          pageno: { type: "number", default: 1 },
        },
        required: ["query"],
      },
    },
    {
      name: "web_read",
      description:
        "Read a web page and convert to clean markdown. Cached 24h. " +
        "Uses Readability+Turndown by default (~ms). Set llm=true for " +
        "ReaderLM-v2 on complex pages (~10-30s). Supports batch with " +
        "urls[] for parallel reads. Auto-detects GitHub, Reddit, YouTube, " +
        "HackerNews, StackExchange, Wikipedia, ArXiv, MDN, npm, Docker Hub, PDFs.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to read" },
          urls: {
            type: "array",
            items: { type: "string" },
            description: "Multiple URLs to read in parallel (batch mode)",
          },
          format: { type: "string", enum: ["markdown", "text"], default: "markdown" },
          llm: { type: "boolean", default: false, description: "Use ReaderLM-v2 for higher quality (~10-30s)" },
          with_links_summary: { type: "boolean", default: false, description: "Extract and return a summary of links" },
          with_images_summary: {
            type: "boolean",
            default: false,
            description: "Extract and return a summary of images",
          },
          max_length: { type: "number", description: "Max content chars per page" },
        },
      },
    },
    {
      name: "web_search_read",
      description:
        "Search the web AND automatically read the top results in one call. " +
        "Returns search results with the full content of the top N pages already extracted. " +
        "Eliminates the need for separate search→read→read round trips.",
      inputSchema: {
        type: "object",
        properties: {
          ...SEARCH_PARAMS,
          read_count: { type: "number", description: "Number of top results to auto-read (1–5)", default: 3 },
          ...CONTENT_PARAMS,
        },
        required: ["query"],
      },
    },
    {
      name: "web_screenshot",
      description:
        "Capture a screenshot of a web page as a PNG image. " +
        "Requires Chrome/Chromium installed. Useful for viewing charts, layouts, UIs, " +
        "and any visual content that can't be represented as text.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to screenshot" },
          width: { type: "number", description: "Viewport width in pixels", default: 1280 },
          height: { type: "number", description: "Viewport height in pixels", default: 800 },
          full_page: { type: "boolean", default: false, description: "Capture the full scrollable page" },
          format: { type: "string", enum: ["png", "jpeg"], default: "png" },
        },
        required: ["url"],
      },
    },
  ],
}));

// --- Tool handlers ---

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "web_search") return await handleSearch(args);
  if (name === "web_read") return await handleRead(args);
  if (name === "web_search_read") return await handleSearchRead(args);
  if (name === "web_screenshot") return await handleScreenshot(args);
  return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
});

// --- Core search logic (returns structured data) ---

/**
 * Execute a search and return structured data (not formatted text).
 * Used by both web_search and web_search_read handlers.
 */
async function doSearch(args) {
  const { query, count = 10, engine = "auto", categories, language, time_range, pageno = 1, domains, filetype } = args;
  const cacheKey = `search:${query}:${count}:${engine}:${categories}:${language}:${time_range}:${pageno}:${(domains || []).join(",")}:${filetype || ""}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.error(`   Cache HIT: search "${query}"`);
    return { data: cached, engine: `${cached._engine} (cached)` };
  }
  let data, usedEngine;
  const useSX = engine === "searxng" || (engine === "auto" && searxngAvailable);
  if (useSX) {
    try {
      data = await searchSearXNG(query, {
        count: Math.min(count, 20),
        categories,
        language,
        timeRange: time_range,
        pageno,
        domains,
        filetype,
      });
      usedEngine = "searxng";
    } catch {
      if (engine === "auto") {
        searxngAvailable = false;
        data = await searchBing(query, { count });
        usedEngine = "bing (fallback)";
      } else throw new Error("SearXNG down");
    }
  } else {
    data = await searchBing(query, { count });
    usedEngine = "bing";
  }
  data._engine = usedEngine;
  setCache(cacheKey, data);
  return { data, engine: usedEngine };
}

// --- Search handler (formats for MCP response) ---

async function handleSearch(args) {
  try {
    const { data, engine: usedEngine } = await doSearch(args);
    return { content: [{ type: "text", text: formatSearchResponse(data, usedEngine) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Search error: ${e.message}` }], isError: true };
  }
}

// --- Read handler ---

async function handleRead(args) {
  const {
    url,
    urls,
    format = "markdown",
    llm = false,
    with_links_summary = false,
    with_images_summary = false,
    max_length,
  } = args;
  const targetUrls = urls?.length ? urls : url ? [url] : [];
  if (!targetUrls.length) return { content: [{ type: "text", text: "Provide url or urls[]" }], isError: true };
  try {
    const results = await Promise.all(
      targetUrls.map((u) =>
        readPage(u, {
          format,
          llm,
          withLinksSummary: with_links_summary,
          withImagesSummary: with_images_summary,
          maxLength: max_length,
        }).catch((e) => ({
          url: u,
          title: "Error",
          description: "",
          content: `Error: ${e.message}`,
          source: "error",
          format,
        })),
      ),
    );
    return { content: [{ type: "text", text: results.map(formatReadResponse).join("\n\n---\n\n") }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Read error: ${e.message}` }], isError: true };
  }
}

// --- Screenshot handler ---

async function handleScreenshot(args) {
  const { url, width = 1280, height = 800, full_page = false, format = "png" } = args;
  try {
    const result = await takeScreenshot(url, { width, height, fullPage: full_page, format });
    const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
    return {
      content: [
        {
          type: "text",
          text: `Screenshot of **${result.title}**\n🔗 ${url}\n📐 ${result.width}x${result.height}${full_page ? " (full page)" : ""}\n`,
        },
        { type: "image", data: result.screenshot, mimeType },
      ],
    };
  } catch (e) {
    return { content: [{ type: "text", text: `Screenshot error: ${e.message}` }], isError: true };
  }
}

// --- Search + Read handler ---

async function handleSearchRead(args) {
  const {
    query,
    count = 10,
    read_count: readCount = 3,
    engine = "auto",
    categories,
    language,
    time_range,
    domains,
    filetype,
    format = "markdown",
    max_length: maxLength,
  } = args;

  // Clamp read_count to 1–5
  const effectiveReadCount = Math.min(Math.max(readCount, 1), 5);

  // Check combined cache first
  const combinedCacheKey = `searchread:${query}:${count}:${engine}:${categories}:${language}:${time_range}:${(domains || []).join(",")}:${filetype || ""}:${effectiveReadCount}:${format}:${maxLength || "none"}`;
  const combinedCached = getCached(combinedCacheKey);
  if (combinedCached) {
    console.error(`   Cache HIT: search_read "${query}"`);
    return { content: [{ type: "text", text: combinedCached.text }] };
  }

  try {
    // Step 1: Search (structured data, not formatted text)
    const { data, engine: usedEngine } = await doSearch({
      query,
      count,
      engine,
      categories,
      language,
      time_range,
      domains,
      filetype,
    });
    const searchText = formatSearchResponse(data, usedEngine);

    // Extract URLs from structured results (not from formatted text)
    const urls = (data.results || [])
      .slice(0, effectiveReadCount)
      .map((r) => r.url)
      .filter(Boolean);

    if (!urls.length) {
      return { content: [{ type: "text", text: searchText }] };
    }

    console.error(`   search_read: reading top ${urls.length} pages in parallel...`);

    // Step 2: Read top N pages in parallel
    const readResults = await Promise.all(
      urls.map((u) =>
        readPage(u, { format, maxLength }).catch((e) => ({
          url: u,
          title: "Error",
          description: "",
          content: `Error: ${e.message}`,
          source: "error",
          format,
        })),
      ),
    );

    // Step 3: Combine search results + page contents
    const pageContents = readResults.map(formatReadResponse).join("\n\n---\n\n");
    const combined = `${searchText}\n\n${"=".repeat(60)}\n\n📖 **Page contents (top ${urls.length}):**\n\n${pageContents}`;

    setCache(combinedCacheKey, { text: combined });
    return { content: [{ type: "text", text: combined }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Search+Read error: ${e.message}` }], isError: true };
  }
}

// ============================================================================
// Startup
// ============================================================================

async function main() {
  console.error(`Hugin v${config.version}`);

  // SearXNG (auto-start if Docker is available)
  const searxng = await ensureSearXNGReady();
  searxngAvailable = searxng.available;
  if (searxng.available) {
    console.error("   SearXNG ready");
  } else {
    console.error("   SearXNG unavailable — using Bing fallback");
    if (searxng.reason === "not_installed") {
      console.error("   Install Docker for full search: https://docs.docker.com/get-docker/");
    } else if (searxng.reason === "not_running") {
      console.error("   Start Docker to enable full search");
    }
    console.error("   Run: npx @ketlark/hugin-mcp setup");
  }

  // ReaderLM (optional)
  const hasLLM = await checkReaderLM();
  console.error(hasLLM ? "   ✅ ReaderLM-v2 (llm=true)" : "   ⚠️  ReaderLM not available");

  // Puppeteer (optional)
  await warmBrowser();

  console.error(`   💾 Cache: ${getCacheCount()} entries (${config.cacheTtl}s TTL)`);
  if (config.chromePath) {
    console.error(`   🌐 Puppeteer: ${config.chromePath}`);
  } else {
    console.error("   ⚠️  No Chrome/Chromium found — SPA/403 fallback disabled");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("   🚀 Ready\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
