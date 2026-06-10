import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { htmlToMarkdown, stripTags, cleanHTML, extractLinks, extractImages } from "../../src/html.js";

describe("stripTags", () => {
  it("removes all HTML tags", () => {
    assert.strictEqual(stripTags("<h1>Hello</h1> <b>world</b>"), "Hello world");
  });
  it("returns plain text unchanged", () => {
    assert.strictEqual(stripTags("no tags here"), "no tags here");
  });
});

describe("cleanHTML", () => {
  it("removes script and style blocks", () => {
    const html = '<script>alert("xss")</script><p>keep</p><style>.x{}</style>';
    assert.ok(!cleanHTML(html).includes("script"));
    assert.ok(!cleanHTML(html).includes("style"));
    assert.ok(cleanHTML(html).includes("keep"));
  });
});

describe("htmlToMarkdown", () => {
  it("converts headings and paragraphs", () => {
    const md = htmlToMarkdown("<h1>Title</h1><p>Paragraph</p>");
    assert.match(md, /Title/);
    assert.match(md, /Paragraph/);
  });
  it("handles empty input", () => {
    assert.strictEqual(htmlToMarkdown(""), "");
  });
});

describe("extractLinks", () => {
  it("extracts markdown links", () => {
    const links = extractLinks("[Google](https://google.com) [GitHub](https://github.com)");
    assert.strictEqual(links.length, 2);
    assert.strictEqual(links[0].text, "Google");
    assert.strictEqual(links[0].href, "https://google.com");
  });
  it("returns undefined for no links", () => {
    assert.strictEqual(extractLinks("no links here"), undefined);
  });
});

describe("extractImages", () => {
  it("extracts markdown images", () => {
    const images = extractImages("![alt text](http://img.png)");
    assert.strictEqual(images.length, 1);
    assert.strictEqual(images[0].alt, "alt text");
  });
});