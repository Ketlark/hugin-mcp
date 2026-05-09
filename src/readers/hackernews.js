/**
 * HackerNews reader — Firebase API, free, no key, no rate limit.
 */

const API_BASE = "https://hacker-news.firebaseio.com/v0";

export function canHandle(url) {
  return url.includes("news.ycombinator.com");
}

export async function read(url) {
  const itemMatch = url.match(/news\.ycombinator\.com\/item\?id=(\d+)/);
  if (itemMatch) return await readItem(itemMatch[1]);

  // Front page listing
  if (!url.includes("/item?")) return await readListing(url);
  return null;
}

async function readItem(id) {
  try {
    const r = await fetch(`${API_BASE}/item/${id}.json`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const item = await r.json();
    if (!item) return null;

    let md = `# ${item.title || "Comment"}\n\n`;
    md += `**By** ${item.by} | **Score** ${item.score || 0} | 📅 ${fmtDate(item.time)}\n\n`;
    if (item.text) md += cleanHtml(item.text) + "\n\n";
    if (item.url) md += `🔗 [External link](${item.url})\n\n`;
    md += `💬 ${item.descendants || 0} comments\n\n`;

    if (item.kids?.length) {
      md += `---\n\n## Comments\n\n`;
      for (const kidId of item.kids.slice(0, 10)) {
        try {
          const cr = await fetch(`${API_BASE}/item/${kidId}.json`, { signal: AbortSignal.timeout(5000) });
          if (!cr.ok) continue;
          const c = await cr.json();
          if (c?.text) {
            md += `**${c.by}** (${fmtDate(c.time)}):\n> ${cleanHtml(c.text).substring(0, 400)}\n\n`;
          }
        } catch {}
      }
    }
    console.error(`   HN API: item ${id} "${item.title?.substring(0, 40)}" (${item.kids?.length || 0} kids)`);
    return { title: item.title || `HN Comment by ${item.by}`, description: item.title || "", content: md, source: "hn-api" };
  } catch (e) {
    console.error(`   HN API failed: ${e.message}`);
    return null;
  }
}

async function readListing(url) {
  let listType = "topstories";
  if (url.includes("newest")) listType = "newstories";
  else if (url.includes("best")) listType = "beststories";
  else if (url.includes("ask")) listType = "askstories";
  else if (url.includes("show")) listType = "showstories";

  try {
    const r = await fetch(`${API_BASE}/${listType}.json`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const ids = await r.json();

    const stories = await Promise.all(
      ids.slice(0, 20).map((id) =>
        fetch(`${API_BASE}/item/${id}.json`, { signal: AbortSignal.timeout(10000) })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );

    let md = `# Hacker News — ${listType.replace("stories", " stories")}\n\n`;
    stories.filter(Boolean).forEach((s, i) => {
      md += `${i + 1}. **${s.title}**\n`;
      md += `   ⬆️ ${s.score} | 💬 ${s.descendants || 0} | by ${s.by} | ${s.url ? `[link](${s.url})` : `[discussion](https://news.ycombinator.com/item?id=${s.id})`}\n\n`;
    });
    console.error(`   HN API: ${listType} (${stories.filter(Boolean).length} stories)`);
    return { title: `Hacker News — ${listType}`, description: "Hacker News", content: md, source: "hn-api" };
  } catch (e) {
    console.error(`   HN API failed: ${e.message}`);
    return null;
  }
}

function fmtDate(unix) { return new Date(unix * 1000).toLocaleDateString(); }
function cleanHtml(h) { return h.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
