#!/usr/bin/env node

/**
 * Hugin setup command — validates Docker, starts SearXNG, checks the environment.
 * Usage: npx @ketlark/hugin-mcp setup
 */

import { config } from "./config.js";
import { checkDocker, ensureSearXNG, startSearXNG } from "./search/searxng.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GRAY = "\x1b[90m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function ok(msg) {
  console.log(`${GREEN}  ✓${RESET} ${msg}`);
}
function fail(msg) {
  console.log(`${RED}  ✗${RESET} ${msg}`);
}
function warn(msg) {
  console.log(`${YELLOW}  ⚠${RESET} ${msg}`);
}
function info(msg) {
  console.log(`${GRAY}    ${msg}${RESET}`);
}

async function setup() {
  console.log(`\n${BOLD}Hugin MCP — Setup${RESET}\n`);

  let score = 0;
  let total = 0;

  // --- Node.js ---
  total++;
  console.log(`${BOLD}Node.js${RESET}`);
  console.log(`    ${process.version}`);
  ok("Node.js");
  score++;

  // --- Docker ---
  total++;
  console.log(`\n${BOLD}Docker${RESET}`);
  const docker = checkDocker();
  if (docker.ok) {
    ok("Docker installed and running");
    score++;
  } else if (docker.reason === "not_installed") {
    fail("Docker is not installed");
    info("Install: https://docs.docker.com/get-docker/");
    info("Without Docker, Hugin falls back to Bing search (fewer engines, less reliable).");
  } else if (docker.reason === "not_running") {
    fail("Docker daemon is not running");
    info("Start Docker Desktop, or run: sudo systemctl start docker");
    info("Without Docker, Hugin falls back to Bing search (fewer engines, less reliable).");
  } else {
    fail(`Docker error: ${docker.message}`);
  }

  // --- SearXNG ---
  total++;
  console.log(`\n${BOLD}SearXNG${RESET}`);
  if (docker.ok) {
    const running = await ensureSearXNG();
    if (running) {
      ok("Already running");
      score++;
    } else {
      console.log(`    Not running. Starting...`);
      const started = await startSearXNG();
      if (started) {
        ok("Started");
        score++;
      } else {
        fail("Could not start");
        info("Try manually: docker compose up -d");
        info("Then check: curl http://localhost:8888/healthz");
      }
    }
  } else {
    warn("Skipped (Docker unavailable)");
  }

  // --- Chrome ---
  total++;
  console.log(`\n${BOLD}Chrome / Puppeteer${RESET}`);
  if (config.chromePath) {
    ok(`Found: ${config.chromePath}`);
    score++;
  } else {
    warn("No Chrome/Chromium found");
    info("Set CHROME_PATH to enable Puppeteer (SPA/403 page fallback).");
    info("Hugin works without it — only affects pages that need browser rendering.");
  }

  // --- ReaderLM ---
  total++;
  console.log(`\n${BOLD}ReaderLM-v2${RESET}`);
  try {
    const r = await fetch("http://localhost:1234/v1/models", { signal: AbortSignal.timeout(2000) });
    const hasLLM = r.ok;
    if (hasLLM) {
      ok("ReaderLM-v2 available");
      score++;
    } else {
      warn("Not available (optional)");
    }
  } catch {
    warn("Not available (optional)");
    info("Install LM Studio + download ReaderLM-v2 for higher quality page reading.");
  }

  // --- Cache ---
  console.log(`\n${BOLD}Cache${RESET}`);
  console.log(`    ${config.cacheDir} (${config.cacheTtl}s TTL)`);

  // --- Summary ---
  console.log(`\n${BOLD}${"─".repeat(40)}${RESET}`);
  if (score === total) {
    console.log(`${GREEN}${BOLD}  All good.${RESET} Hugin is ready.\n`);
  } else if (score >= total - 1) {
    console.log(`${YELLOW}${BOLD}  Almost there.${RESET} Core features work. Optional components missing.\n`);
  } else {
    console.log(`${RED}${BOLD}  Needs attention.${RESET} SearXNG search won't work without Docker.\n`);
  }

  // --- MCP config snippets ---
  console.log(`${BOLD}MCP client configuration:${RESET}`);
  console.log();
  console.log(`${GRAY}  Claude Code:${RESET}`);
  console.log(`    claude mcp add hugin-mcp -- npx -y @ketlark/hugin-mcp@latest`);
  console.log();
  console.log(`${GRAY}  JSON config (Claude Desktop, Cursor, Windsurf, etc.):${RESET}`);
  console.log(`    {
      "mcpServers": {
        "hugin-mcp": {
          "command": "npx",
          "args": ["-y", "@ketlark/hugin-mcp@latest"]
        }
      }
    }`);
  console.log();
}

setup().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
