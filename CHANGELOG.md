# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] - 2026-06-10

### Added
- feat: `web_search_read` tool — search + auto-read top N pages in one call
- feat: `web_screenshot` tool — capture page screenshots as PNG/JPEG via Puppeteer
- feat: `domains[]` parameter on `web_search` — restrict search to specific domains
- feat: `filetype` parameter on `web_search` — restrict search to file type

## [1.0.0] - 2026-05-09

### Added
- feat: `web_search` tool — SearXNG (70+ engines) + Bing fallback
- feat: `web_read` tool — 14 specialized readers + Readability + Puppeteer fallback
- feat: SQLite cache (24h TTL), Puppeteer warm pool, cookie banner dismiss
- feat: ReaderLM-v2 optional integration
- feat: `npx @ketlark/hugin-mcp setup` command
- feat: Docker auto-start for SearXNG, Chrome auto-detect