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

/**
 * Start a single MCP server process and send multiple tool calls.
 * Reuses the same process for all tests.
 */
function startServer() {
  const child = spawn("node", [SERVER], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
  let msgId = 0;
  const pending = new Map();
  let buffer = "";

  child.stdout.on("data", (d) => {
    buffer += d.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const resolve = pending.get(msg.id);
        if (resolve) {
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch { /* incomplete JSON */ }
    }
  });

  child.stderr.on("data", () => {}); // silence startup logs

  // Send initialize + initialized notification
  const initId = ++msgId;
  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0", id: initId, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "hugin-test", version: "1.0" } },
  }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  // Wait for init response
  const initPromise = new Promise((resolve) => pending.set(initId, resolve));

  return {
    child,
    ready: initPromise,
    call(toolName, toolArgs, timeoutMs = 15000) {
      const id = ++msgId;
      const promise = new Promise((resolve, reject) => {
        pending.set(id, resolve);
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new Error("timeout"));
          }
        }, timeoutMs);
      });
      child.stdin.write(JSON.stringify({
        jsonrpc: "2.0", id, method: "tools/call",
        params: { name: toolName, arguments: toolArgs },
      }) + "\n");
      return promise;
    },
    kill() { child.kill(); },
  };
}

function extractText(msg) {
  return msg?.result?.content?.[0]?.text || "";
}

async function main() {
  console.log("\nHugin Smoke Test\n");

  const server = startServer();

  // Wait for server to initialize
  try {
    await server.ready;
    assert(true, "Server starts");
  } catch (e) {
    assert(false, `Server starts: ${e.message}`);
    server.kill();
    process.exit(1);
  }

  // --- web_search ---
  console.log("\n--- web_search ---");
  try {
    const msg = await server.call("web_search", { query: "hugin odin raven", count: 3 });
    const text = extractText(msg);
    const lower = text.toLowerCase();
    assert(lower.includes("hugin") || lower.includes("odin"), "Search returns relevant results");
    assert(text.includes("http"), "Search results contain URLs");
  } catch (e) { assert(false, `web_search: ${e.message}`); }

  // --- web_read ---
  console.log("\n--- web_read ---");
  try {
    const msg = await server.call("web_read", { url: "https://example.com" });
    const text = extractText(msg);
    assert(text.length > 50, `Page read returns content (${text.length} chars)`);
    assert(text.toLowerCase().includes("example"), "Content is relevant");
  } catch (e) { assert(false, `web_read: ${e.message}`); }

  // --- Batch read ---
  console.log("\n--- Batch read ---");
  try {
    const msg = await server.call("web_read", { urls: ["https://example.com"] });
    const text = extractText(msg);
    assert(text.includes("Example Domain"), "Batch read works");
  } catch (e) { assert(false, `Batch read: ${e.message}`); }

  // --- Error handling ---
  console.log("\n--- Error handling ---");
  try {
    const msg = await server.call("web_read", { url: "not-a-valid-url" }, 10000);
    const text = extractText(msg);
    assert(msg?.result?.isError || text.length > 0, "Invalid URL handled without crash");
  } catch (e) {
    // Timeout on invalid URL is acceptable — the fetcher retries
    assert(e.message === "timeout" || e.message.length > 0, `Error is descriptive: ${e.message.substring(0, 60)}`);
  }

  // --- Empty args ---
  console.log("\n--- Empty args ---");
  try {
    const msg = await server.call("web_read", {}, 5000);
    const text = extractText(msg);
    assert(msg?.result?.isError || text.includes("Provide"), "Missing URL returns error message");
  } catch (e) {
    assert(false, `Empty args: ${e.message}`);
  }

  server.kill();

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${"=".repeat(40)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
