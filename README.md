<p align="center">
  <img src="assets/logo.png" alt="Hugin MCP — Web Search & Reader Server" width="500">
  <br>
  <strong>100% local, 100% free</strong> MCP server for web search &amp; web reading
  <br>
  <em>No API keys. No accounts. No data leaves your machine.</em>
</p>

<p align="center">
  <a href="#installation"><strong>Install</strong></a> ·
  <a href="#tools-reference"><strong>Tools</strong></a> ·
  <a href="#configuration"><strong>Config</strong></a> ·
  <a href="#comparison"><strong>Comparison</strong></a> ·
  <a href="TRACKER.md"><strong>Roadmap</strong></a>
</p>

---

**Hugin MCP** is a [Model Context Protocol](https://modelcontextprotocol.io/) server for web search and page reading. Runs locally, needs no API keys, costs nothing. Named after Odin's raven who scouted the world each morning.

## What it does

| MCP Tool | Description |
|---|---|
| **`web_search`** | Search the web via [SearXNG](https://searxng.org/) (70+ search engines: Google, Bing, DuckDuckGo, Brave…) or Bing fallback |
| **`web_read`** | Read any URL → clean markdown. Auto-detects 14+ specialized handlers (GitHub, Reddit, YouTube, Wikipedia…) |

### Supported sites (specialized readers)

| Site | Method | Auth required? |
|---|---|---|
| GitHub (issues, PRs, repos, files) | REST API | No (60 req/h) |
| Reddit (posts, comments, subreddits) | JSON API + old.reddit | No |
| YouTube (transcripts with timestamps) | Innertube API | No |
| HackerNews (stories, comments) | Firebase API | No |
| StackExchange (300+ Q&A sites) | Public API | No |
| Wikipedia | MediaWiki API | No |
| ArXiv (papers, abstract) | HTML scraping | No |
| MDN Web Docs | index.json API | No |
| npm packages | Registry API | No |
| Docker Hub (images, tags) | v2 API | No |
| PDF files | pdf-parse | — |
| Any other page | Readability + Turndown + Puppeteer fallback | — |

---

## Installation

### 1. Clone and install

```bash
git clone https://github.com/Ketlark/hugin-mcp.git
cd hugin-mcp
npm install
```

> **Requirements:** [Node.js](https://nodejs.org/) ≥ 18. Works without Docker, without SearXNG, without Chrome — Bing search + Readability handle everything by default.

### 2. (Recommended) Start SearXNG for full search

```bash
docker compose up -d
```

This starts a local SearXNG instance. Without it, Hugin MCP falls back to Bing scraping automatically.

### 3. Configure your MCP client

Pick your client below. Replace `/path/to/hugin-mcp` with the absolute path.

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add hugin-mcp -- node /path/to/hugin-mcp/src/index.js
```

Or add to `.mcp.json` at your project root:

```json
{
  "mcpServers": {
    "hugin-mcp": {
      "command": "node",
      "args": ["/path/to/hugin-mcp/src/index.js"]
    }
  }
}
```

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "hugin-mcp": {
      "command": "node",
      "args": ["/path/to/hugin-mcp/src/index.js"]
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Create `.cursor/mcp.json` at your project root:

```json
{
  "mcpServers": {
    "hugin-mcp": {
      "command": "node",
      "args": ["/path/to/hugin-mcp/src/index.js"]
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Settings → Tools & MCP → New MCP Server:

```json
{
  "mcpServers": {
    "hugin-mcp": {
      "command": "node",
      "args": ["/path/to/hugin-mcp/src/index.js"]
    }
  }
}
```

</details>

<details>
<summary><strong>Any MCP client (npx)</strong></summary>

```json
{
  "mcpServers": {
    "hugin-mcp": {
      "command": "npx",
      "args": ["-y", "@ketlark/hugin-mcp"]
    }
  }
}
```

</details>

---

## Tools Reference

### `web_search`

Search the web. Results are cached for 24 hours.

```json
{
  "name": "web_search",
  "arguments": {
    "query": "rust async await tutorial",
    "count": 10,
    "engine": "auto",
    "categories": "general",
    "language": "en",
    "time_range": "month"
  }
}
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` | string | **required** | Search query. Supports `site:`, `"exact"`, `-exclude` |
| `count` | number | 10 | Max results (1–20) |
| `engine` | string | `"auto"` | `"auto"`, `"searxng"`, or `"bing"` |
| `categories` | string | — | `general`, `news`, `images`, `videos`, `it`, `science`, `music`, `files`, `social media` |
| `language` | string | auto | `en`, `fr`, `de`, `es`, `ja`, `zh`, etc. |
| `time_range` | string | — | `day`, `month`, `year` |
| `pageno` | number | 1 | Page number |

### `web_read`

Read a web page → clean markdown. Content is cached for 24 hours.

```json
{
  "name": "web_read",
  "arguments": {
    "url": "https://github.com/microsoft/typescript/issues/1"
  }
}
```

Batch mode — read multiple URLs in parallel:

```json
{
  "name": "web_read",
  "arguments": {
    "urls": [
      "https://github.com/owner/repo",
      "https://www.reddit.com/r/programming",
      "https://en.wikipedia.org/wiki/Rust_(programming_language)"
    ]
  }
}
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `url` | string | — | Single URL to read |
| `urls` | string[] | — | Multiple URLs for batch parallel reads |
| `format` | string | `"markdown"` | `"markdown"` or `"text"` |
| `llm` | boolean | `false` | Use ReaderLM-v2 for higher quality (slower) |
| `with_links_summary` | boolean | `false` | Extract link summary |
| `with_images_summary` | boolean | `false` | Extract image summary |
| `max_length` | number | — | Truncate content to N characters |

---

## Configuration

All configuration is via environment variables. Zero config needed — defaults work.

| Variable | Default | Description |
|---|---|---|
| `HUGIN_SEARXNG_URL` | `http://localhost:8888` | SearXNG instance URL |
| `HUGIN_SEARXNG_PORT` | `8888` | Port for auto-started SearXNG container |
| `HUGIN_LMSTUDIO_URL` | `http://localhost:1234` | LM Studio endpoint |
| `HUGIN_READERLM_MODEL` | `readerlm-v2-mlx` | ReaderLM model name |
| `HUGIN_READERLM_MAX_INPUT` | `15000` | Max HTML chars sent to ReaderLM |
| `CHROME_PATH` | *auto-detected* | Chrome/Chromium executable path |
| `HUGIN_PUPPETEER_TIMEOUT` | `15000` | Puppeteer page load timeout (ms) |
| `HUGIN_CACHE_DIR` | `.cache` | SQLite cache directory |
| `HUGIN_CACHE_TTL` | `86400` | Cache TTL in seconds (24h) |

### Chrome/Chromium auto-detection

Hugin MCP automatically finds Chrome, Chromium, Brave, or Edge on your system:

| Platform | Search paths |
|---|---|
| **macOS** | `/Applications/Google Chrome.app`, `Chromium.app`, `Brave Browser.app`, `Microsoft Edge.app` |
| **Linux** | `/usr/bin/google-chrome`, `/usr/bin/chromium`, `/usr/bin/brave-browser`, `/snap/bin/chromium` |
| **Windows** | `C:\Program Files\Google\Chrome\Application\chrome.exe`, `Brave`, `Edge` |

Set `CHROME_PATH` to override. If no browser is found, Puppeteer features are silently disabled (SPA/403 fallback won't work, but everything else does).

### Quick setup with `.env`

```bash
cp .env.example .env
# Edit .env — or just leave defaults
```

---

## Optional: ReaderLM-v2

For higher quality HTML→Markdown on complex pages (heavy JS, nested layouts), you can use [ReaderLM-v2](https://huggingface.co/jinaai/ReaderLM-v2) via LM Studio.

1. Install [LM Studio](https://lmstudio.ai/)
2. Search for `ReaderLM-v2` and download a quantized version (e.g. `readerlm-v2-q8-mlx` for Apple Silicon)
3. Load the model and start the server: `lms server start`
4. Set `llm: true` when calling `web_read`

> Without ReaderLM, Hugin MCP works fine via Mozilla Readability + Turndown. Only needed for heavy-JS pages where Readability chokes.

---

## CLI (development)

```bash
# Search
node src/cli.mjs search "rust async tutorial" 5

# Read a page
node src/cli.mjs read "https://example.com"
node src/cli.mjs read "https://example.com" llm    # with ReaderLM

# Check status (SearXNG, LM Studio)
node src/cli.mjs status
```

---

## Architecture

```
src/
├── index.js              # MCP entry point (server wiring only)
├── config.js             # Environment variables + platform detection
├── cache.js              # SQLite WAL cache (get/set with TTL)
├── fetcher.js            # robustFetch (retry, rate-limit) + Puppeteer
├── html.js               # Readability, Turndown, HTML cleaning
├── llm.js                # ReaderLM-v2 client (LM Studio)
├── format.js             # Response formatters
├── search/
│   ├── searxng.js        # SearXNG client + auto-start
│   └── bing.js           # Bing scraping fallback
└── readers/
    ├── index.js          # Router: dispatches URL → best reader
    ├── github.js         # GitHub REST API
    ├── reddit.js         # Reddit JSON API + old.reddit
    ├── youtube.js        # YouTube Innertube transcripts
    ├── hackernews.js     # HN Firebase API
    ├── stackexchange.js  # StackExchange API (300+ sites)
    ├── wikipedia.js      # MediaWiki API (clean sections)
    ├── arxiv.js          # ArXiv paper metadata
    ├── mdn.js            # MDN docs JSON API
    ├── npm.js            # npm registry API
    ├── dockerhub.js      # Docker Hub v2 API
    └── pdf.js            # PDF text extraction
```

### Reading pipeline

```
URL → cache? → specialized reader? → Readability → Turndown → markdown
                     │                     │
                     │                     └→ Puppeteer (if SPA/403)
                     └→ ReaderLM (if llm=true)
```

---

## Comparison with other MCP web search servers

| | **Hugin MCP** | [Tavily MCP](https://github.com/tavily-ai/tavily-mcp) | [Exa MCP](https://github.com/exa-labs/exa-mcp-server) | [Jina MCP](https://github.com/jina-ai/MCP) | [Brave MCP](https://github.com/brave/brave-search-mcp-server) | [Firecrawl MCP](https://github.com/firecrawl/firecrawl-mcp-server) |
|---|---|---|---|---|---|---|
| **Cost** | **$0** | Freemium (1k/mo) | $1000 free then paid | Freemium | $5/mo credit | Freemium (1k/mo) |
| **100% local** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ (or self-host) |
| **No API key** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Web search** | ✅ 70+ engines | ✅ | ✅ neural | ✅ | ✅ Brave index | ✅ |
| **Page reading** | ✅ 14+ handlers | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Batch reads** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Cache** | ✅ SQLite | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Data privacy** | Everything stays on your machine | Queries sent to Tavily | Queries sent to Exa | Pages sent to Jina | Queries sent to Brave | Pages sent to Firecrawl |

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `SearXNG unavailable — Bing fallback` | Run `docker compose up -d` or check Docker is running |
| `No Chrome/Chromium found` | Set `CHROME_PATH` or install Chrome/Chromium |
| `ReaderLM not available` | Start LM Studio and load a ReaderLM model (optional) |
| `better-sqlite3` build fails | Ensure `python3` and `build-essential` (Linux) or Xcode CLI (macOS) are installed |
| StackOverflow/Cloudflare 403 | Ensure Chrome is installed and detected for Puppeteer fallback |

---

## License

[MIT](LICENSE)

---

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [SearXNG](https://searxng.org/) — metasearch engine
- [Mozilla Readability](https://github.com/nickcolley/readability) — article extraction
- [Turndown](https://github.com/mixmark-io/turndown) — HTML to Markdown converter
- [Puppeteer](https://pptr.dev/) — browser automation
