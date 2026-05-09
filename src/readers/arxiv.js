/**
 * ArXiv paper reader — scrapes meta tags from the abs page.
 * No API key needed, just follow redirects and parse HTML.
 */

import { robustFetch } from "../fetcher.js";
import { config } from "../config.js";
import { htmlToMarkdown, stripTags } from "../html.js";

export function canHandle(url) {
  return /arxiv\.org\/abs\//.test(url);
}

export async function read(url) {
  // Normalize: extract paper ID, follow redirect
  const idMatch = url.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
  if (!idMatch) return null;
  const paperId = idMatch[1];

  try {
    const r = await robustFetch(`https://arxiv.org/abs/${paperId}`, {
      timeout: 15000,
      headers: { "User-Agent": `Hugin/${config.version}` },
    });
    if (!r.ok) return null;
    const html = await r.text();

    // Extract metadata from meta tags
    const title = html.match(/meta name="citation_title" content="([^"]*)"/)?.[1] || "";
    const authors = [...html.matchAll(/meta name="citation_author" content="([^"]*)"/g)].map((m) => m[1]);
    const date = html.match(/meta name="citation_date" content="([^"]*)"/)?.[1] || "";
    const pdfUrl = html.match(/meta name="citation_pdf_url" content="([^"]*)"/)?.[1] || "";

    // Extract abstract from the page
    const abstractMatch = html.match(/id="abstract"[^>]*>([\s\S]*?)<\/div>/);
    const abstract = abstractMatch
      ? stripTags(abstractMatch[1]).replace(/\s+/g, " ").trim()
      : "";

    // Extract categories
    const subjects = html.match(/class="primary-subject"[^>]*>([^<]*)/)?.[1] || "";

    let md = `# ${title}\n\n`;
    if (authors.length) md += `**Authors:** ${authors.join(", ")}\n\n`;
    if (date) md += `📅 ${date}\n\n`;
    if (subjects) md += `🏷️ ${subjects}\n\n`;
    if (abstract) md += `## Abstract\n\n${abstract}\n\n`;
    if (pdfUrl) md += `📄 [PDF](${pdfUrl})\n`;

    console.error(`   ArXiv: ${title.substring(0, 60)}... (${authors.length} authors)`);
    return { title, description: abstract?.substring(0, 200) || `ArXiv ${paperId}`, content: md, source: "arxiv" };
  } catch (e) {
    console.error(`   ArXiv failed: ${e.message}`);
    return null;
  }
}
