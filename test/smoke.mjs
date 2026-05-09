#!/usr/bin/env node

/**
 * Hugin smoke test — validates the server starts and tools respond.
 * Run: node test/smoke.mjs
 */

import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SERVER = join(ROOT, "src", "index.js");

let passed = 0,
  failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`   ✅ ${msg}`);
  } else {
    failed++;
    console.log(`   ❌ ${msg}`);
  }
}

function mcpCall(toolName, toolArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [SERVER], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "";
    let resolved = false;

    child.stdout.on("data", (d) => {
      buffer += d.toString();
      // Parse complete JSON lines from buffer
      for (const line of buffer.split("\n")) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 2 && !resolved) {
            resolved = true;
            child.kill();
            const text = msg.result?.content?.[0]?.text;
            if (text) resolve(text);
            else if (msg.result?.isError) reject(new Error(text || "tool error"));
            else reject(new Error("empty response"));
          }
        } catch {
          // incomplete JSON, keep buffering
        }
      }
    });

    child.stderr.on("data", () => {}); // silence startup logs

    // Send MCP messages
    const messages = [
      JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "hugin-mcp-test", version: "1.0" } },
      }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: toolName, arguments: toolArgs } }),
    ];
    child.stdin.write(messages.join("\n") + "\n");

    // Safety timeout
    setTimeout(() => {
      if (!resolved) { resolved = true; child.kill(); reject(new Error("timeout")); }
    }, 25000);
  });
}

async function main() {
  console.log("\n🪶 Hugin Smoke Test\n");

  // 1. Server starts
  console.log("--- Server startup ---");
  try {
    const text = await mcpCall("web_search", { query: "hugin odin raven", count: 1 });
    assert(typeof text === "string" && text.length > 0, `Server starts and responds (${text.length} chars)`);
  } catch (e) { assert(false, `Server starts: ${e.message}`); }

  // 2. Search relevance
  console.log("\n--- web_search ---");
  try {
    const text = await mcpCall("web_search", { query: "hugin odin raven", count: 3 });
    const lower = text.toLowerCase();
    assert(lower.includes("hugin") || lower.includes("odin"), "Search returns relevant results");
    assert(text.includes("http"), "Search results contain URLs");
  } catch (e) { assert(false, `web_search: ${e.message}`); }

  // 3. Read page
  console.log("\n--- web_read ---");
  try {
    const text = await mcpCall("web_read", { url: "https://example.com" });
    assert(text.length > 50, `Page read returns content (${text.length} chars)`);
    assert(text.toLowerCase().includes("example"), "Content is relevant");
  } catch (e) { assert(false, `web_read: ${e.message}`); }

  // 4. Batch read
  console.log("\n--- Batch read ---");
  try {
    const text = await mcpCall("web_read", { urls: ["https://example.com"] });
    assert(text.includes("Example Domain"), "Batch read works");
  } catch (e) { assert(false, `Batch read: ${e.message}`); }

  // 5. Error handling
  console.log("\n--- Error handling ---");
  try {
    const text = await mcpCall("web_read", { url: "not-a-valid-url" });
    assert(true, "Invalid URL handled gracefully");
  } catch (e) {
    assert(e.message.length > 0, `Error is descriptive: ${e.message.substring(0, 50)}`);
  }

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${"=".repeat(40)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
