import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installHappyDom } from "./test-dom.ts";

const { restore } = installHappyDom("https://proseus.test/download");
const { getFilenameFromDisposition, triggerDownload } = await import("../client/lib/download.ts");

afterAll(() => {
  restore();
});

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("download", () => {
  test("extracts a filename from Content-Disposition", () => {
    expect(
      getFilenameFromDisposition('attachment; filename="character-card.png"', "fallback.png"),
    ).toBe("character-card.png");
  });

  test("falls back when Content-Disposition is missing or invalid", () => {
    expect(getFilenameFromDisposition(null, "fallback.png")).toBe("fallback.png");
    expect(getFilenameFromDisposition("attachment", "fallback.png")).toBe("fallback.png");
  });

  test("triggerDownload creates, clicks, and cleans up a temporary anchor", () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;

    let clickedHref = "";
    let clickedDownload = "";

    URL.createObjectURL = (value: Blob | MediaSource) => {
      expect(value).toBe(blob);
      return "blob:mock-url";
    };
    URL.revokeObjectURL = (url: string) => {
      expect(url).toBe("blob:mock-url");
    };
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clickedHref = this.href;
      clickedDownload = this.download;
    };

    try {
      triggerDownload(blob, "notes.txt");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
    }

    expect(clickedHref).toBe("blob:mock-url");
    expect(clickedDownload).toBe("notes.txt");
    expect(document.body.childElementCount).toBe(0);
  });
});
