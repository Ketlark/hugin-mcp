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

import { config } from "./config.js";
import { getCached, setCache, getCacheCount } from "./cache.js";
import { checkReaderLM } from "./llm.js";
import { warmBrowser } from "./fetcher.js";
import { searchSearXNG, ensureSearXNG, startSearXNG } from "./search/searxng.js";
import { searchBing } from "./search/bing.js";
import { readPage } from "./readers/index.js";
import { formatSearchResponse, formatReadResponse } from "./format.js";

// ============================================================================
// MCP Server
// ============================================================================

let searxngAvailable = false;

const server = new Server(
  { name: "hugin-mcp", version: config.version },
  { capabilities: { tools: {} } },
);

// --- Tool definitions ---

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
          query: { type: "string", description: 'Search query (supports site:, "exact", -exclude)' },
          count: { type: "number", description: "Max results (1–20)", default: 10 },
          engine: { type: "string", enum: ["auto", "searxng", "bing"], default: "auto" },
          categories: {
            type: "string",
            description: "general, news, images, videos, it, science, music, files, social media",
          },
          language: { type: "string", description: "en, fr, de, es, ja, zh, etc." },
          time_range: { type: "string", enum: ["day", "month", "year"] },
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
          with_images_summary: { type: "boolean", default: false, description: "Extract and return a summary of images" },
          max_length: { type: "number", description: "Max content chars per page" },
        },
      },
    },
  ],
}));

// --- Tool handlers ---

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "web_search") return await handleSearch(args);
  if (name === "web_read") return await handleRead(args);
  return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
});

// --- Search handler ---

async function handleSearch(args) {
  const { query, count = 10, engine = "auto", categories, language, time_range, pageno = 1 } = args;
  const cacheKey = `search:${query}:${count}:${engine}:${categories}:${language}:${time_range}:${pageno}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.error(`   Cache HIT: search "${query}"`);
    return { content: [{ type: "text", text: formatSearchResponse(cached, cached._engine + " (cached)") }] };
  }
  try {
    let data, usedEngine;
    const useSX = engine === "searxng" || (engine === "auto" && searxngAvailable);
    if (useSX) {
      try {
        data = await searchSearXNG(query, { count: Math.min(count, 20), categories, language, timeRange: time_range, pageno });
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
    return { content: [{ type: "text", text: formatSearchResponse(data, usedEngine) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Search error: ${e.message}` }], isError: true };
  }
}

// --- Read handler ---

async function handleRead(args) {
  const { url, urls, format = "markdown", llm = false, with_links_summary = false, with_images_summary = false, max_length } = args;
  const targetUrls = urls?.length ? urls : url ? [url] : [];
  if (!targetUrls.length) return { content: [{ type: "text", text: "Provide url or urls[]" }], isError: true };
  try {
    const results = await Promise.all(
      targetUrls.map((u) =>
        readPage(u, { format, llm, withLinksSummary: with_links_summary, withImagesSummary: with_images_summary, maxLength: max_length }).catch((e) => ({
          url: u, title: "Error", description: "", content: `Error: ${e.message}`, source: "error", format,
        })),
      ),
    );
    return { content: [{ type: "text", text: results.map(formatReadResponse).join("\n\n---\n\n") }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Read error: ${e.message}` }], isError: true };
  }
}

// ============================================================================
// Startup
// ============================================================================

async function main() {
  console.error(`🪶 Hugin v${config.version}`);

  // SearXNG
  searxngAvailable = await ensureSearXNG();
  if (!searxngAvailable) searxngAvailable = await startSearXNG();
  console.error(searxngAvailable ? "   ✅ SearXNG" : "   ⚠️  SearXNG unavailable — Bing fallback");

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
