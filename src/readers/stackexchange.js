/**
 * StackExchange reader — 300+ Q&A sites via public API.
 * Free, no key needed (optional key increases quota).
 */

const SE_SITES = {
  "stackoverflow.com": "stackoverflow",
  "serverfault.com": "serverfault",
  "superuser.com": "superuser",
  "askubuntu.com": "askubuntu",
  "math.stackexchange.com": "math",
  "stats.stackexchange.com": "stats",
  "datascience.stackexchange.com": "datascience",
  "security.stackexchange.com": "security",
};

function getSite(hostname) {
  if (SE_SITES[hostname]) return SE_SITES[hostname];
  const m = hostname.match(/([^.]+)\.stackexchange\.com/);
  return m ? m[1] : null;
}

export function canHandle(url) {
  try { return getSite(new URL(url).hostname) !== null; } catch { return false; }
}

export async function read(url) {
  const u = new URL(url);
  const site = getSite(u.hostname);
  if (!site) return null;

  const qMatch = u.pathname.match(/\/questions\/(\d+)/);
  if (!qMatch) return null;

  const qId = qMatch[1];
  const apiBase = "https://api.stackexchange.com/2.3";
  const params = new URLSearchParams({ order: "desc", sort: "votes", site, filter: "withbody", pagesize: "5" });

  try {
    const qr = await fetch(`${apiBase}/questions/${qId}?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!qr.ok) return null;
    const qData = await qr.json();
    const question = qData.items?.[0];
    if (!question) return null;

    const ar = await fetch(`${apiBase}/questions/${qId}/answers?${params}`, { signal: AbortSignal.timeout(10000) });
    const aData = ar.ok ? await ar.json() : { items: [] };

    let md = `# ${question.title}\n\n`;
    md += `**Score** ${question.score} | 💬 ${question.answer_count} answers | 📅 ${new Date(question.creation_date * 1000).toLocaleDateString()}\n\n`;
    md += stripHtml(question.body).substring(0, 3000) + "\n\n---\n\n";

    for (const a of (aData.items || []).slice(0, 5)) {
      const accepted = a.is_accepted ? " ✅ ACCEPTED" : "";
      md += `## Answer by ${a.owner?.display_name || "anonymous"} (${a.score} pts${accepted})\n\n`;
      md += stripHtml(a.body).substring(0, 3000) + "\n\n";
    }
    console.error(`   StackExchange API: ${site} #${qId} (${question.answer_count} answers)`);
    return { title: question.title, description: stripHtml(question.body).substring(0, 200), content: md, source: "stackexchange-api" };
  } catch (e) {
    console.error(`   StackExchange API failed: ${e.message}`);
    return null;
  }
}

function stripHtml(h) {
  return h ? h.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim() : "";
}
