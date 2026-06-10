/**
 * ReaderLM-v2 client — local LLM via LM Studio for HTML→Markdown conversion.
 */

import { config } from "./config.js";

let readerLMAvailable = null;

export async function checkReaderLM() {
  if (readerLMAvailable !== null) return readerLMAvailable;
  try {
    const r = await fetch(`${config.lmstudioUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) {
      readerLMAvailable = false;
      return false;
    }
    const data = await r.json();
    readerLMAvailable = data.data?.some((m) => m.id === config.readerlmModel || m.id.includes("readerlm")) || false;
    return readerLMAvailable;
  } catch {
    readerLMAvailable = false;
    return false;
  }
}

export async function readerLMConvert(articleHTML) {
  const available = await checkReaderLM();
  if (!available) return null;

  const stripped = articleHTML
    .replace(/\s*(class|id|style|data-[a-z-]+|aria-[a-z-]+|role|tabindex)="[^"]*"/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const input = stripped.substring(0, config.readerlmMaxInput);
  const prompt = `Extract the main content from the given HTML and convert it to Markdown format.\n\`\`\`html\n${input}\n\`\`\``;

  try {
    const start = Date.now();
    const r = await fetch(`${config.lmstudioUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({
        model: config.readerlmModel,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8192,
        temperature: 0,
        repetition_penalty: 1.08,
      }),
    });
    if (!r.ok) {
      readerLMAvailable = false;
      return null;
    }
    const data = await r.json();
    let content = data.choices?.[0]?.message?.content || "";
    if (!content) return null;
    content = content
      .replace(/^```(?:markdown|md)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    console.error(
      `   ReaderLM: ${data.usage?.prompt_tokens}→${data.usage?.completion_tokens} tokens in ${((Date.now() - start) / 1000).toFixed(1)}s`,
    );
    return content;
  } catch (e) {
    console.error(`   ReaderLM failed: ${e.message}`);
    readerLMAvailable = false;
    return null;
  }
}
