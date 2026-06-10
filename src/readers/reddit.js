/**
 * Reddit reader — JSON API for posts (fast, no auth), old.reddit.com for subreddits.
 */

import { config } from "../config.js";
import { safeHostname } from "../html.js";

export function canHandle(url) {
  const h = safeHostname(url);
  return h === "www.reddit.com" || h === "reddit.com";
}

/**
 * Returns { fetchURL, handled } — either handles it entirely or rewrites the URL.
 */
export async function read(url, _opts = {}) {
  if (url.includes("/comments/")) {
    return await readPost(url);
  }
  // Subreddit listing: rewrite to old.reddit.com, let generic reader handle it
  return { rewrite: url.replace(/^(https?:\/\/)(?:www\.)?reddit\.com/, "$1old.reddit.com") };
}

async function readPost(url) {
  const jsonUrl = `${url.replace(/\/$/, "")}.json`;
  try {
    const r = await fetch(jsonUrl, {
      headers: { "User-Agent": `Hugin/${config.version} (local)` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const post = data[0]?.data?.children?.[0]?.data;
    if (!post) return null;

    let md = `# ${post.title}\n\n`;
    md += `**By** u/${post.author} | **Score** ${post.score} | 💬 ${post.num_comments} comments\n\n`;
    if (post.selftext) md += `${post.selftext}\n\n`;
    if (post.url && !post.is_self) md += `🔗 [Link](${post.url})\n\n`;

    const comments = data[1]?.data?.children?.filter((c) => c.kind === "t1").slice(0, 10) || [];
    if (comments.length) {
      md += `---\n\n## Comments\n\n`;
      for (const c of comments) {
        const body = c.data?.body?.substring(0, 500) || "";
        md += `**u/${c.data?.author}** (${c.data?.score} pts):\n> ${body.replace(/\n/g, "\n> ")}\n\n`;
      }
    }
    console.error(`   Reddit JSON API: ${post.title.substring(0, 50)}... (${comments.length} comments)`);
    return {
      title: post.title,
      description: post.selftext?.substring(0, 200) || `r/${post.subreddit}`,
      content: md,
      source: "reddit-api",
    };
  } catch (e) {
    console.error(`   Reddit JSON API failed: ${e.message}`);
    return null;
  }
}
