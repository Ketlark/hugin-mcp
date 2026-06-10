<p align="center">
  <img src="assets/logo.png" alt="Hugin MCP" width="400">
  <br><br>
  <strong>Web search & reader for AI agents</strong><br>
  100% local. $0. No API keys. No data leaves your machine.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ketlark/hugin-mcp"><img src="https://img.shields.io/npm/v/@ketlark/hugin-mcp?color=blue" alt="npm"></a>
  <img src="https://img.shields.io/github/actions/workflow/status/Ketlark/hugin-mcp/ci.yml?branch=main" alt="CI">
  <img src="https://img.shields.io/node/v/@ketlark/hugin-mcp" alt="node">
  <img src="https://img.shields.io/github/license/Ketlark/hugin-mcp" alt="license">
</p>

<p align="center">
  <a href="#install"><strong>Install</strong></a> ·
  <a href="#tools"><strong>Tools</strong></a> ·
  <a href="#why-hugin"><strong>Why Hugin</strong></a> ·
  <a href="#vs-others"><strong>vs Others</strong></a> ·
  <a href="TRACKER.md"><strong>Roadmap</strong></a>
</p>

---

Two tools become four. That's all your agent needs.

```
web_search("rust async tutorial")          → 10 results from 70+ engines
web_read("https://github.com/...")          → clean markdown, zero noise
web_search_read("rust async tutorial")      → search + read top 3 in one call
web_screenshot("https://example.com")       → PNG screenshot of any page
```

Hugin runs a local SearXNG metasearch engine and 14 specialized page readers. Named after Odin's raven who scouted the world each morning and came back with answers.

---

## Install

### Step 1 — Docker

SearXNG runs in Docker and aggregates 70+ search engines (Google, Bing, DuckDuckGo, Brave, Startpage…). Without it, Hugin falls back to Bing — works, but limited.

```bash
# Make sure Docker is running, then:
docker compose up -d
```

No Docker? [Install Docker Desktop](https://docs.docker.com/get-docker/) first.

### Step 2 — MCP client

Pick your client below.

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add hugin-mcp -- npx -y @ketlark/hugin-mcp@latest
```

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "hugin-mcp": {
      "command": "npx",
      "args": ["-y", "@ketlark/hugin-mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

`.cursor/mcp.json` at project root:

```json
{
  "mcpServers": {
    "hugin-mcp": {
      "command": "npx",
      "args": ["-y", "@ketlark/hugin-mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf / Any MCP client</strong></summary>

Same pattern — point to `npx -y @ketlark/hugin-mcp@latest`:

```json
{
  "mcpServers": {
    "hugin-mcp": {
      "command": "npx",
      "args": ["-y", "@ketlark/hugin-mcp@latest"]
    }
  }
}
```

</details>

### Step 3 — Verify (optional)

```bash
npx @ketlark/hugin-mcp setup
```

This checks Docker, SearXNG, Chrome, and prints a status report.

---

## Tools

### `web_search`

```json
{
  "query": "rust async await tutorial",
  "count": 10,
  "engine": "auto",
  "categories": "general",
  "language": "en",
  "time_range": "month",
  "domains": ["github.com", "stackoverflow.com"],
  "filetype": "pdf"
}
```

| Parameter | Default | Description |
|---|---|---|
| `query` | *required* | Search query. Supports `site:`, `"exact"`, `-exclude` |
| `count` | 10 | Max results (1–20) |
| `engine` | `"auto"` | `"auto"`, `"searxng"`, or `"bing"` |
| `categories` | — | `general`, `news`, `images`, `videos`, `it`, `science`, `music`, `files`, `social media` |
| `language` | auto | `en`, `fr`, `de`, `es`, `ja`, `zh`, etc. |
| `time_range` | — | `day`, `month`, `year` |
| `pageno` | 1 | Page number |
| `domains` | — | Restrict to specific domains, e.g. `["github.com"]` |
| `filetype` | — | Restrict to file type, e.g. `"pdf"`, `"doc"` |

Results are cached for 24 hours.

### `web_read`

Single URL:

```json
{ "url": "https://github.com/microsoft/typescript/issues/1" }
```

Batch — read multiple URLs in parallel:

```json
{
  "urls": [
    "https://github.com/owner/repo",
    "https://www.reddit.com/r/programming",
    "https://en.wikipedia.org/wiki/Rust_(programming_language)"
  ]
}
```

| Parameter | Default | Description |
|---|---|---|
| `url` | — | Single URL to read |
| `urls` | — | Multiple URLs for batch parallel reads |
| `format` | `"markdown"` | `"markdown"` or `"text"` |
| `llm` | `false` | Use ReaderLM-v2 for higher quality (slower, requires [LM Studio](https://lmstudio.ai/)) |
| `with_links_summary` | `false` | Extract link summary |
| `with_images_summary` | `false` | Extract image summary |
| `max_length` | — | Truncate content to N characters |

Content is cached for 24 hours.

### `web_search_read`

Search + read in one call. Eliminates the need for separate search → read → read round trips.

```json
{
  "query": "rust async await tutorial",
  "count": 10,
  "read_count": 3,
  "max_length": 5000
}
```

| Parameter | Default | Description |
|---|---|---|
| `query` | *required* | Search query |
| `count` | 10 | Max search results (1–20) |
| `read_count` | 3 | Number of top results to auto-read (1–5) |
| `engine` | `"auto"` | `"auto"`, `"searxng"`, or `"bing"` |
| `categories` | — | Same as `web_search` |
| `language` | auto | Same as `web_search` |
| `time_range` | — | Same as `web_search` |
| `domains` | — | Same as `web_search` |
| `filetype` | — | Same as `web_search` |
| `format` | `"markdown"` | `"markdown"` or `"text"` |
| `max_length` | — | Max content chars per page read |

### `web_screenshot`

Capture a screenshot of any web page. Returns a PNG or JPEG image.

```json
{
  "url": "https://github.com",
  "width": 1280,
  "height": 800,
  "full_page": false,
  "format": "png"
}
```

| Parameter | Default | Description |
|---|---|---|
| `url` | *required* | URL to screenshot |
| `width` | 1280 | Viewport width in pixels |
| `height` | 800 | Viewport height in pixels |
| `full_page` | `false` | Capture the full scrollable page |
| `format` | `"png"` | `"png"` or `"jpeg"` |

Requires Chrome/Chromium installed.

---

## Why Hugin

**14 specialized readers.** Hugin detects the site you're reading and uses a dedicated API instead of generic HTML scraping. GitHub issues → REST API. YouTube → transcript API. Wikipedia → MediaWiki. Cleaner output, faster responses, fewer rate limits.

| Site | Method | Auth? |
|---|---|---|
| GitHub (issues, PRs, repos, files) | REST API | No (60 req/h) |
| Reddit (posts, comments, subreddits) | JSON API | No |
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

**SQLite cache.** Every search result and page read gets cached for 24 hours. Your agent won't re-fetch the same page twice in a session.

**Zero config.** Chrome auto-detection across macOS, Linux, Windows (Chrome, Chromium, Brave, Edge). No browser found? Puppeteer features turn off — everything else works.

**Graceful fallback chain.** SearXNG down? Bing takes over. Readability fails? Puppeteer renders the page. Puppeteer blocked? ReaderLM-v2 can pick it up (if you have LM Studio running).

---

## vs Others

| | **Hugin** | Tavily | Exa | Jina | Brave | Firecrawl |
|---|---|---|---|---|---|---|
| **Cost** | **$0** | Freemium | Paid | Freemium | $5/mo | Freemium |
| **100% local** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **No API key** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Web search** | ✅ 70+ engines | ✅ | ✅ neural | ✅ | ✅ | ✅ |
| **Page reading** | ✅ 14 handlers | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Search + Read** | ✅ one call | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Screenshots** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Batch reads** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Cache** | ✅ SQLite | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Domain filters** | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| **Data privacy** | Stays on your machine | Sent to Tavily | Sent to Exa | Sent to Jina | Sent to Brave | Sent to Firecrawl |

Every competitor sends your queries or page content to a cloud API. Hugin doesn't.

---

## Configuration

Defaults work out of the box. Override with environment variables or a `.env` file:

| Variable | Default | What it does |
|---|---|---|
| `HUGIN_SEARXNG_URL` | `http://localhost:8888` | SearXNG instance URL |
| `HUGIN_SEARXNG_PORT` | `8888` | Port for auto-started SearXNG container |
| `HUGIN_LMSTUDIO_URL` | `http://localhost:1234` | LM Studio endpoint (ReaderLM) |
| `HUGIN_READERLM_MODEL` | `readerlm-v2-mlx` | ReaderLM model name |
| `CHROME_PATH` | *auto-detected* | Chrome/Chromium executable |
| `HUGIN_PUPPETEER_TIMEOUT` | `15000` | Puppeteer timeout (ms) |
| `HUGIN_CACHE_DIR` | `.cache` | SQLite cache directory |
| `HUGIN_CACHE_TTL` | `86400` | Cache TTL in seconds (24h) |

<details>
<summary><strong>Chrome auto-detection paths</strong></summary>

| Platform | Search paths |
|---|---|
| **macOS** | Google Chrome, Chromium, Brave Browser, Microsoft Edge |
| **Linux** | `/usr/bin/google-chrome`, `/usr/bin/chromium`, `/usr/bin/brave-browser`, `/snap/bin/chromium` |
| **Windows** | `C:\Program Files\Google\Chrome\Application\chrome.exe`, Brave, Edge |

Set `CHROME_PATH` to override. No browser found = Puppeteer disabled, everything else works.

</details>

<details>
<summary><strong>ReaderLM-v2 setup (optional)</strong></summary>

For complex pages where Readability struggles (heavy JS, nested layouts):

1. Install [LM Studio](https://lmstudio.ai/)
2. Download `ReaderLM-v2` (quantized, e.g. `readerlm-v2-q8-mlx` for Apple Silicon)
3. Load the model and start the server
4. Pass `"llm": true` in `web_read`

Without ReaderLM, Hugin works fine via Readability + Turndown for the vast majority of pages.

</details>

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `SearXNG unavailable — Bing fallback` | Run `docker compose up -d` or start Docker Desktop |
| `Docker is not installed` | [Install Docker Desktop](https://docs.docker.com/get-docker/) |
| `Docker daemon is not running` | Start Docker Desktop or run `sudo systemctl start docker` |
| `No Chrome/Chromium found` | Set `CHROME_PATH` or install Chrome/Chromium |
| `better-sqlite3` build fails | Install `python3` + `build-essential` (Linux) or Xcode CLI tools (macOS) |
| Cloudflare 403 | Install Chrome for Puppeteer fallback |

---

## Architecture

```
src/
├── index.js              # MCP entry point
├── setup.js              # Setup command (npx @ketlark/hugin-mcp setup)
├── config.js             # Env vars + platform detection
├── cache.js              # SQLite WAL cache
├── fetcher.js            # HTTP fetch (retry, rate-limit) + Puppeteer
├── html.js               # Readability + Turndown
├── llm.js                # ReaderLM-v2 client
├── screenshot.js         # Puppeteer screenshot → base64
├── format.js             # Response formatters
├── search/
│   ├── searxng.js        # SearXNG client + auto-start + Docker detection
│   └── bing.js           # Bing fallback
└── readers/
    ├── index.js          # URL → reader router
    ├── github.js         # GitHub REST API
    ├── reddit.js         # Reddit JSON API
    ├── youtube.js        # YouTube transcripts
    ├── hackernews.js     # HN Firebase API
    ├── stackexchange.js  # 300+ Q&A sites
    ├── wikipedia.js      # MediaWiki API
    ├── arxiv.js          # ArXiv metadata
    ├── mdn.js            # MDN JSON API
    ├── npm.js            # npm registry
    ├── dockerhub.js      # Docker Hub v2
    └── pdf.js            # PDF text extraction
```

Reading pipeline:

```
URL → cache? → specialized reader? → Readability → Turndown → markdown
                     │                     │
                     │                     └→ Puppeteer (SPA/403)
                     └→ ReaderLM (if llm=true)
```

---

## License

[MIT](LICENSE)

---

Hugin depends on [SearXNG](https://searxng.org/), [Mozilla Readability](https://github.com/nickcolley/readability), [Turndown](https://github.com/mixmark-io/turndown), and [Puppeteer](https://pptr.dev/).
