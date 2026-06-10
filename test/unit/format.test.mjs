import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatReadResponse, formatSearchResponse } from "../../src/format.js";

describe("formatSearchResponse", () => {
  it("formats results with engine name", () => {
    const text = formatSearchResponse(
      { query: "test", results: [{ title: "T", url: "http://a.com", snippet: "S", domain: "a.com" }], page: 1 },
      "searxng",
    );
    assert.match(text, /test/);
    assert.match(text, /http:\/\/a\.com/);
    assert.match(text, /searxng/);
  });

  it("handles empty results", () => {
    const text = formatSearchResponse({ query: "empty", results: [], page: 1 }, "bing");
    assert.match(text, /0 results/);
  });
});

describe("formatReadResponse", () => {
  it("formats a page with title, url, content", () => {
    const text = formatReadResponse({ title: "Hello", url: "http://b.com", content: "Body text", source: "test" });
    assert.match(text, /# Hello/);
    assert.match(text, /http:\/\/b\.com/);
    assert.match(text, /Body text/);
  });

  it("handles missing title", () => {
    const text = formatReadResponse({ title: "", url: "http://c.com", content: "X", source: "test" });
    assert.match(text, /Untitled/);
  });
});
