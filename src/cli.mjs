#!/usr/bin/env node

/**
 * Hugin CLI — quick test harness.
 *
 *   node src/cli.mjs search "query" [count]
 *   node src/cli.mjs read "url" [llm]
 *   node src/cli.mjs status
 */

import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SERVER = join(ROOT, "src", "index.js");

const cmd = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  console.log(`
Hugin — 100% local web search + reader for MCP

Usage:
  node src/cli.mjs search "query" [count]   Search the web
  node src/cli.mjs read "url" [llm]         Read a web page
  node src/cli.mjs status                    Check SearXNG + ReaderLM
`);
  process.exit(0);
}

// --- Status command (no MCP needed) ---
if (cmd === "status") {
  const checks = [
    { name: "SearXNG", url: "http://localhost:8888/healthz" },
    { name: "LM Studio", url: "http://localhost:1234/v1/models" },
  ];
  for (const c of checks) {
    try {
      const r = await fetch(c.url, { signal: AbortSignal.timeout(2000) });
      console.log(`   ${r.ok ? "✅" : "❌"} ${c.name} (${r.status})`);
    } catch {
      console.log(`   ❌ ${c.name} (unreachable)`);
    }
  }
  process.exit(0);
}

// --- MCP-based commands ---
if (!arg1) { console.error("Missing argument. Run with --help."); process.exit(1); }

let toolName, toolArgs;
if (cmd === "search") {
  toolName = "web_search";
  toolArgs = { query: arg1, count: parseInt(arg2) || 5 };
} else if (cmd === "read") {
  toolName = "web_read";
  toolArgs = { url: arg1, llm: arg2 === "llm", max_length: 5000 };
} else {
  console.error(`Unknown command: ${cmd}. Run with --help.`);
  process.exit(1);
}

// Spawn server and send MCP messages
const child = spawn("node", [SERVER], { cwd: ROOT, stdio: ["pipe", "pipe", "inherit"] });
let buffer = "";

child.stdout.on("data", (d) => {
  buffer += d.toString();
  for (const line of buffer.split("\n")) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id === 2) {
        const text = msg.result?.content?.[0]?.text;
        if (text) console.log(text);
        child.kill();
        process.exit(0);
      }
      buffer = buffer.slice(line.length + 1);
    } catch {
      // incomplete JSON
    }
  }
});

const messages = [
  JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "hugin-mcp-cli", version: "1.0" } },
  }),
  JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: toolName, arguments: toolArgs } }),
];
child.stdin.write(messages.join("\n") + "\n");

setTimeout(() => { child.kill(); process.exit(1); }, 30000);
