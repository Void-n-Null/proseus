import { afterAll, describe, expect, test } from "bun:test";
import fc from "fast-check";
import { installHappyDom } from "./test-dom.ts";

const { restore } = installHappyDom("https://proseus.test/chat");
const { renderMarkdown, renderStreamingMarkdown } = await import("../client/lib/markdown.ts");

afterAll(() => {
  restore();
});

describe("markdown", () => {
  test("renders basic markdown formatting", () => {
    const html = renderMarkdown("# Hello\n\nThis is **bold** and *italic*.");

    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  test("renders code blocks without throwing", async () => {
    const input = "```ts\nconst value = 42;\n```";

    const firstPass = renderMarkdown(input);
    await Bun.sleep(0);
    const secondPass = renderMarkdown(input);

    expect(firstPass).toContain("<pre><code");
    expect(secondPass).toContain("const");
    expect(secondPass).toContain("value =");
    expect(secondPass).toContain("language-ts");
    expect(secondPass).toContain("hljs");
  });

  test("sanitizes script tags and unsafe attributes", () => {
    const html = renderMarkdown(
      '<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">click</a>',
    );

    expect(html.toLowerCase()).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("onerror=");
    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  test("empty input returns an empty string", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderStreamingMarkdown("")).toBe("");
  });

  test("streaming renderer handles incomplete markdown gracefully", () => {
    expect(() => renderStreamingMarkdown("```ts\nconst value =")).not.toThrow();
    expect(renderStreamingMarkdown("```ts\nconst value =")).toContain("<pre><code");
  });

  test("property: finalized markdown never contains script tags", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const output = renderMarkdown(input);
        return !output.toLowerCase().includes("<script");
      }),
      { numRuns: 100 },
    );
  });

  test("property: streaming markdown always returns a string", () => {
    fc.assert(
      fc.property(fc.string(), (input) => typeof renderStreamingMarkdown(input) === "string"),
      { numRuns: 100 },
    );
  });
});
