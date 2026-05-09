/**
 * YouTube transcript reader — Innertube API, no key needed.
 * Returns timestamped transcript from video captions.
 */

export function canHandle(url) {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/.test(url);
}

export async function read(url) {
  const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/)?.[1];
  if (!videoId) return null;

  try {
    // Step 1: Get innertube API key from video page
    const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    const pageHtml = await pageResp.text();
    const apiKey = pageHtml.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

    // Step 2: Get captions track list (Android client impersonation)
    const resp = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "com.google.android.youtube/19.02.39 (Linux; U; Android 14)",
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "19.02.39", hl: "en" } },
        videoId,
      }),
    });
    if (!resp.ok) return null;
    const playerData = await resp.json();

    const title = playerData.videoDetails?.title || "";
    const author = playerData.videoDetails?.author || "";
    const lengthSeconds = parseInt(playerData.videoDetails?.lengthSeconds || "0");

    // Find caption tracks
    const captionTracks = playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (!captionTracks.length) return null;

    // Prefer manual (not auto-generated), English or first
    const track = captionTracks.find((t) => !t.kind && t.languageCode?.startsWith("en"))
      || captionTracks.find((t) => !t.kind)
      || captionTracks[0];

    // Step 3: Fetch caption XML
    const captionResp = await fetch(track.baseUrl, { signal: AbortSignal.timeout(10000) });
    if (!captionResp.ok) return null;
    const captionXml = await captionResp.text();

    // Parse <text start="0.27" dur="3.12">Hello world</text>
    const segments = [...captionXml.matchAll(/<text[^>]*start="([^"]+)"[^>]*dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g)];
    const transcript = segments.map((s) => {
      const text = decodeXmlEntities(stripTags(s[3]));
      const start = parseFloat(s[1]);
      return `[${fmtTime(start)}] ${text}`;
    }).join("\n");

    if (!transcript) return null;

    let md = `# ${title}\n\n`;
    md += `**By** ${author} | ⏱️ ${fmtTime(lengthSeconds)}\n\n---\n\n${transcript}`;

    console.error(`   YouTube transcript: ${title.substring(0, 50)}... (${segments.length} segments)`);
    return { title, description: `YouTube video by ${author}`, content: md, source: "youtube-transcript" };
  } catch (e) {
    console.error(`   YouTube transcript failed: ${e.message}`);
    return null;
  }
}

// --- Helpers ---

function stripTags(html) { return html.replace(/<[^>]+>/g, ""); }

function decodeXmlEntities(text) {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
