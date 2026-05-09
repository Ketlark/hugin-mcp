/**
 * MDN Web Docs reader — uses the public index.json endpoint.
 * Returns structured documentation with sections, code examples, browser compat.
 */

import { safeHostname } from "../html.js";
import { htmlToMarkdown } from "../html.js";
import { config } from "../config.js";

export function canHandle(url) {
  return safeHostname(url) === "developer.mozilla.org";
}

export async function read(url) {
  try {
    const jsonUrl = url.replace(/\/$/, "") + "/index.json";
    const r = await fetch(jsonUrl, {
      headers: { "User-Agent": `Hugin/${config.version}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const doc = data.doc;
    if (!doc) return null;

    const title = doc.title || doc.pageTitle || "";
    const summary = doc.summary || "";

    // Extract prose sections (the actual documentation content)
    let md = `# ${title}\n\n`;
    if (summary) md += `> ${summary}\n\n`;

    const sections = doc.body || [];
    for (const section of sections) {
      if (section.type === "prose" && section.value?.content) {
        const sectionTitle = section.value.title;
        const content = htmlToMarkdown(section.value.content);
        if (sectionTitle) md += `## ${sectionTitle}\n\n`;
        md += content + "\n\n";
      }
      // Skip specifications, browser_compatibility, etc. — too verbose
    }

    console.error(`   MDN: ${title} (${sections.length} sections, ${md.length} chars)`);
    return { title, description: summary, content: md, source: "mdn-json" };
  } catch (e) {
    console.error(`   MDN failed: ${e.message}`);
    return null;
  }
}
