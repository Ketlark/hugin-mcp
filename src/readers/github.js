/**
 * GitHub REST API reader — issues, PRs, repos, files.
 * No auth: 60 req/h. JSON responses, no scraping.
 */

import { config } from "../config.js";
import { safeHostname } from "../html.js";

const GITHUB_HEADERS = {
  Accept: "application/vnd.github.v3+json",
  "User-Agent": `Hugin/${config.version}`,
};

export function canHandle(url) {
  return safeHostname(url) === "github.com";
}

export async function read(url) {
  const patterns = [
    { re: /github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/(\d+)/, type: "issue" },
    { re: /github\.com\/([^/]+\/[^/]+)\/?$/, type: "repo" },
    { re: /github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)/, type: "file" },
  ];

  for (const { re, type } of patterns) {
    const m = url.match(re);
    if (!m) continue;
    try {
      if (type === "issue") return await readIssue(m[1], m[2], url);
      if (type === "repo") return await readRepo(m[1]);
      if (type === "file") return await readFile(m[1], m[2], m[3]);
    } catch (e) {
      console.error(`   GitHub API failed: ${e.message}`);
    }
  }
  return null;
}

async function readIssue(repo, num, url) {
  const isPR = url.includes("/pull/");
  const endpoint = isPR ? `pulls/${num}` : `issues/${num}`;

  const r = await fetch(`https://api.github.com/repos/${repo}/${endpoint}`, {
    headers: GITHUB_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  const data = await r.json();

  const cr = await fetch(`https://api.github.com/repos/${repo}/issues/${num}/comments?per_page=10`, {
    headers: GITHUB_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  const comments = cr.ok ? await cr.json() : [];

  let md = `# ${data.title}\n\n`;
  md += `**${isPR ? "Pull Request" : "Issue"}** #${num} | **State:** ${data.state} | `;
  md += `**By:** ${data.user?.login} | 💬 ${data.comments} comments\n\n`;
  if (data.labels?.length) md += `**Labels:** ${data.labels.map((l) => l.name).join(", ")}\n\n`;
  if (data.body) md += `${data.body}\n\n`;
  if (comments.length) {
    md += `---\n\n## Comments\n\n`;
    comments.forEach((c) => {
      md += `**${c.user?.login}** (${new Date(c.created_at).toLocaleDateString()}):\n${c.body?.substring(0, 800)}\n\n`;
    });
  }
  console.error(`   GitHub API: ${repo}#${num} (${comments.length} comments)`);
  return { title: data.title, description: data.body?.substring(0, 200) || "", content: md, source: "github-api" };
}

async function readRepo(repo) {
  const r = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: GITHUB_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  const d = await r.json();

  let readme = "";
  try {
    const rr = await fetch(`https://raw.githubusercontent.com/${repo}/${d.default_branch}/README.md`, {
      signal: AbortSignal.timeout(5000),
    });
    if (rr.ok) readme = await rr.text();
  } catch {}

  let md = `# ${d.full_name}\n\n${d.description || ""}\n\n`;
  md += `⭐ ${d.stargazers_count} | 🍴 ${d.forks_count} | 📝 ${d.language || "unknown"} | 📄 ${d.license?.name || "No license"}\n\n`;
  if (d.topics?.length) md += `**Topics:** ${d.topics.join(", ")}\n\n`;
  if (readme) md += `---\n\n${readme.substring(0, 5000)}`;
  console.error(`   GitHub API: repo ${repo} (${d.stargazers_count}⭐)`);
  return { title: d.full_name, description: d.description || "", content: md, source: "github-api" };
}

async function readFile(repo, branch, path) {
  const r = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/${path}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  const content = await r.text();
  console.error(`   GitHub API: file ${repo}/${path}`);
  return { title: `${repo}/${path}`, description: `File: ${path}`, content, source: "github-raw" };
}
