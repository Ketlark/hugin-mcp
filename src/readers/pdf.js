/**
 * PDF text extraction — uses pdf-parse (pure JS, no binary deps).
 */

export function canHandle(url, contentType) {
  return url.endsWith(".pdf") || contentType?.includes("application/pdf");
}

export async function read(url) {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    const data = await pdfParse(buffer);
    console.error(`   PDF: ${data.numpages} pages, ${data.text.length} chars`);
    return {
      title: data.info?.Title || "PDF Document",
      description: `PDF — ${data.numpages} pages`,
      content: `# ${data.info?.Title || "PDF Document"}\n\n${data.text}`,
      source: "pdf-extract",
    };
  } catch (e) {
    console.error(`   PDF extraction failed: ${e.message}`);
    return null;
  }
}
