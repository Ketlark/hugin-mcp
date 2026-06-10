/**
 * Response formatters — convert structured data into human-readable MCP text responses.
 */

export function formatSearchResponse(d, engine) {
  const lines = [
    `Search results for "${d.query}" — ${d.results.length} results via ${engine}${d.page > 1 ? ` (page ${d.page})` : ""}${d.numberOfResults ? ` (${d.numberOfResults} estimated)` : ""}`,
  ];
  if (d.answers?.length) {
    lines.push("", "💬 **Direct answers:**");
    for (const a of d.answers) lines.push(`   ${a.answer} (${a.engine})`);
  }
  if (d.infoboxes?.length) {
    lines.push("", "ℹ️ **Quick info:**");
    for (const ib of d.infoboxes) lines.push(`   **${ib.title}**: ${ib.content?.substring(0, 300)}`);
  }
  lines.push("");
  d.results.forEach((r, i) => {
    lines.push(`${i + 1}. **${r.title}**`, `   🔗 ${r.url}`);
    if (r.domain) lines.push(`   🌐 ${r.domain}`);
    if (r.snippet) lines.push(`   📝 ${r.snippet}`);
    if (r.engine) lines.push(`   ⚙️ ${[...new Set([r.engine, ...(r.engines || [])])].join(", ")}`);
    if (r.publishedDate) lines.push(`   📅 ${r.publishedDate}`);
    lines.push("");
  });
  if (d.suggestions?.length) lines.push(`💡 Suggestions: ${d.suggestions.join(", ")}`);
  return lines.join("\n");
}

export function formatReadResponse(r) {
  const lines = [
    `# ${r.title || "Untitled"}`,
    r.description ? `> ${r.description}` : null,
    `🔗 ${r.url}`,
    `📡 Source: ${r.source}`,
    "",
    "---",
    "",
    r.content,
  ].filter(Boolean);

  if (r.linksSummary?.length) {
    lines.push("", "---", `📎 **Links (${r.linksSummary.length}):**`);
    for (const l of r.linksSummary.slice(0, 20)) lines.push(`   - [${l.text || "untitled"}](${l.href})`);
    if (r.linksSummary.length > 20) lines.push(`   ... +${r.linksSummary.length - 20} more`);
  }
  if (r.imagesSummary?.length) {
    lines.push("", "---", `🖼️ **Images (${r.imagesSummary.length}):**`);
    for (const img of r.imagesSummary) lines.push(`   - ${img.alt || "image"}: ${img.src}`);
  }
  return lines.join("\n");
}
