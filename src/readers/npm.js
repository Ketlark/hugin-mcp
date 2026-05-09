/**
 * npm registry reader — package metadata via registry.npmjs.org.
 * Returns description, version, dependencies, README.
 */

import { config } from "../config.js";

export function canHandle(url) {
  return /^https?:\/\/(www\.)?npmjs\.com\/package\//.test(url);
}

export async function read(url) {
  const pkgMatch = url.match(/npmjs\.com\/package\/(@?[^/?]+)/);
  if (!pkgMatch) return null;
  const pkg = decodeURIComponent(pkgMatch[1]);

  try {
    // Fetch latest version metadata
    const r = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`, {
      headers: { "User-Agent": `Hugin/${config.version}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const data = await r.json();

    let md = `# ${data.name}\n\n`;
    md += `**Version:** ${data.version} | 📜 ${data.license || "unknown"}\n\n`;
    if (data.description) md += `${data.description}\n\n`;

    // Links
    if (data.homepage) md += `🏠 [Homepage](${data.homepage})\n`;
    if (data.repository?.url) md += `📦 [Repository](${data.repository.url.replace(/^git\+/, "")})\n`;
    md += "\n";

    // Dependencies
    const deps = Object.entries(data.dependencies || {});
    if (deps.length) {
      md += `**Dependencies (${deps.length}):** ${deps.map(([k, v]) => `\`${k}@${v}\``).join(", ")}\n\n`;
    }

    // Keywords
    if (data.keywords?.length) md += `**Keywords:** ${data.keywords.join(", ")}\n\n`;

    // README
    if (data.readme) {
      md += `---\n\n${data.readme.substring(0, 8000)}`;
    }

    console.error(`   npm: ${data.name}@${data.version} (${deps.length} deps)`);
    return { title: data.name, description: data.description || "", content: md, source: "npm-registry" };
  } catch (e) {
    console.error(`   npm registry failed: ${e.message}`);
    return null;
  }
}
