/**
 * Docker Hub reader — image metadata via the v2 API.
 * Returns description, tags, pull count.
 */

import { config } from "../config.js";

export function canHandle(url) {
  return /^https?:\/\/hub\.docker\.com\/(?:r\/|_\/)/.test(url);
}

export async function read(url) {
  // hub.docker.com/r/{namespace}/{name} or hub.docker.com/_/{name} (official)
  const match = url.match(/hub\.docker\.com\/(?:r\/([^/]+)\/([^/?]+)|_\/([^/?]+))/);
  if (!match) return null;

  const namespace = match[1] || "library";
  const name = match[2] || match[3];

  try {
    const r = await fetch(`https://hub.docker.com/v2/repositories/${namespace}/${name}/`, {
      headers: { "User-Agent": `Hugin/${config.version}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const data = await r.json();

    let md = `# ${data.namespace}/${data.name}\n\n`;
    if (data.short_description) md += `${data.short_description}\n\n`;
    md += `⬇️ ${fmtNumber(data.pull_count)} pulls | ⭐ ${data.star_count}\n\n`;
    md += `**Updated:** ${new Date(data.last_updated).toLocaleDateString()}\n\n`;
    if (data.os?.length) md += `**OS:** ${data.os.join(", ")}\n\n`;
    if (data.architecture?.length) md += `**Arch:** ${data.architecture.join(", ")}\n\n`;

    // Fetch top tags
    const tagsR = await fetch(
      `https://hub.docker.com/v2/repositories/${namespace}/${name}/tags/?page_size=10&ordering=last_updated`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (tagsR.ok) {
      const tagsData = await tagsR.json();
      if (tagsData.results?.length) {
        md += `## Tags\n\n`;
        md += "| Tag | Size | Updated |\n| --- | --- | --- |\n";
        for (const tag of tagsData.results.slice(0, 15)) {
          const size = tag.full_size ? fmtSize(tag.full_size) : "-";
          md += `| ${tag.name} | ${size} | ${new Date(tag.last_updated).toLocaleDateString()} |\n`;
        }
        md += "\n";
      }
    }

    // Full description (markdown)
    if (data.full_description) {
      md += `---\n\n${data.full_description.substring(0, 5000)}`;
    }

    console.error(`   Docker Hub: ${namespace}/${name} (${fmtNumber(data.pull_count)} pulls)`);
    return {
      title: `${namespace}/${name}`,
      description: data.short_description || "",
      content: md,
      source: "docker-hub",
    };
  } catch (e) {
    console.error(`   Docker Hub failed: ${e.message}`);
    return null;
  }
}

function fmtNumber(n) {
  if (!n) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function fmtSize(bytes) {
  if (!bytes) return "-";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}
