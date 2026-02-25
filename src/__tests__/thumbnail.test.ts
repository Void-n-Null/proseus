/**
 * thumbnail.test.ts — Tests for src/server/lib/thumbnail.ts
 *
 * Image resizing with sharp and in-memory caching. Tests cover:
 *
 *  - parseSizeParam: validation of allowed sizes (128, 256, 512), rejection of
 *    undefined, invalid strings, non-allowed integers, floats, negatives
 *  - resizeAvatar: passthrough when size is null, actual sharp resize with
 *    a real test image, cache hit returns same reference, output is webp
 *  - Property-based: parseSizeParam always returns null or one of {128, 256, 512}
 */

import { test, expect, describe } from "bun:test";
import * as fc from "fast-check";
import sharp from "sharp";

import { parseSizeParam, resizeAvatar } from "../server/lib/thumbnail.ts";

// ── Test fixture: minimal image buffer ───────────────────────

/**
 * Create a small solid-color PNG via sharp for testing.
 * Returns a Uint8Array suitable for resizeAvatar.
 */
async function createTestImage(width: number, height: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 64, b: 32 },
    },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

// ============================================================
// parseSizeParam — Traditional
// ============================================================

describe("parseSizeParam", () => {
  test("returns null for undefined", () => {
    expect(parseSizeParam(undefined)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseSizeParam("")).toBeNull();
  });

  test("returns 128 for '128'", () => {
    expect(parseSizeParam("128")).toBe(128);
  });

  test("returns 256 for '256'", () => {
    expect(parseSizeParam("256")).toBe(256);
  });

  test("returns 512 for '512'", () => {
    expect(parseSizeParam("512")).toBe(512);
  });

  test("returns null for non-allowed sizes", () => {
    expect(parseSizeParam("100")).toBeNull();
    expect(parseSizeParam("200")).toBeNull();
    expect(parseSizeParam("1024")).toBeNull();
    expect(parseSizeParam("64")).toBeNull();
    expect(parseSizeParam("0")).toBeNull();
  });

  test("returns null for negative numbers", () => {
    expect(parseSizeParam("-128")).toBeNull();
    expect(parseSizeParam("-1")).toBeNull();
  });

  test("returns null for purely non-numeric strings", () => {
    expect(parseSizeParam("abc")).toBeNull();
    expect(parseSizeParam("large")).toBeNull();
  });

  test("parseInt behavior: leading digits parsed, trailing chars ignored", () => {
    // parseInt("128px", 10) → 128, which is in ALLOWED_SIZES → returns 128
    expect(parseSizeParam("128px")).toBe(128);
    // parseInt("512abc", 10) → 512 → allowed
    expect(parseSizeParam("512abc")).toBe(512);
    // parseInt("100px", 10) → 100 → NOT in ALLOWED_SIZES → null
    expect(parseSizeParam("100px")).toBeNull();
  });

  test("parseInt behavior: decimals truncated to integer", () => {
    // parseInt("128.5", 10) → 128, which is allowed
    expect(parseSizeParam("128.5")).toBe(128);
    // parseInt("256.0", 10) → 256, allowed
    expect(parseSizeParam("256.0")).toBe(256);
    // parseInt("256.9", 10) → 256, allowed (truncates, doesn't round)
    expect(parseSizeParam("256.9")).toBe(256);
    // parseInt("100.5", 10) → 100, NOT allowed
    expect(parseSizeParam("100.5")).toBeNull();
  });

  test("returns null for NaN-producing inputs", () => {
    expect(parseSizeParam("NaN")).toBeNull();
    expect(parseSizeParam("Infinity")).toBeNull();
  });
});

// ============================================================
// parseSizeParam — Property-Based
// ============================================================

describe("parseSizeParam — property-based", () => {
  test("output is always null or one of {128, 256, 512}", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = parseSizeParam(input);
        return result === null || result === 128 || result === 256 || result === 512;
      }),
      { numRuns: 1000 },
    );
  });

  test("non-numeric strings always return null", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z]+$/),
        (input) => parseSizeParam(input) === null,
      ),
      { numRuns: 200 },
    );
  });

  test("valid size strings always return the corresponding number", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("128", "256", "512"),
        (input) => parseSizeParam(input) === parseInt(input, 10),
      ),
      { numRuns: 50 },
    );
  });

  test("random integers outside {128, 256, 512} always return null", () => {
    fc.assert(
      fc.property(
        fc.integer().filter((n) => n !== 128 && n !== 256 && n !== 512),
        (n) => parseSizeParam(String(n)) === null,
      ),
      { numRuns: 500 },
    );
  });
});

// ============================================================
// resizeAvatar — Traditional
// ============================================================

describe("resizeAvatar", () => {
  test("returns original blob when size is null (passthrough)", async () => {
    const blob = await createTestImage(400, 300);
    const result = await resizeAvatar(blob, "image/png", null, "test-key-null");

    expect(result.buffer).toBe(blob); // Same reference
    expect(result.mime).toBe("image/png"); // Unchanged
  });

  test("resizes landscape image (width >= height) by constraining height", async () => {
    const blob = await createTestImage(800, 600); // 4:3 landscape
    const result = await resizeAvatar(blob, "image/png", 256, "test-landscape");

    // Output should be webp
    expect(result.mime).toBe("image/webp");

    // Verify actual dimensions: height should be 256, width scales proportionally
    const meta = await sharp(result.buffer).metadata();
    expect(meta.height).toBe(256);
    expect(meta.format).toBe("webp");
    // Width should be approximately 256 * (800/600) ≈ 341
    expect(meta.width).toBeGreaterThanOrEqual(340);
    expect(meta.width).toBeLessThanOrEqual(342);
  });

  test("resizes portrait image (height > width) by constraining width", async () => {
    const blob = await createTestImage(400, 800); // 1:2 portrait
    const result = await resizeAvatar(blob, "image/png", 128, "test-portrait");

    expect(result.mime).toBe("image/webp");

    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBe(128);
    // Height should be approximately 128 * (800/400) = 256
    expect(meta.height).toBe(256);
  });

  test("resizes square image by constraining width (height >= width path)", async () => {
    const blob = await createTestImage(500, 500);
    const result = await resizeAvatar(blob, "image/png", 256, "test-square");

    expect(result.mime).toBe("image/webp");

    const meta = await sharp(result.buffer).metadata();
    // Square: w >= h is true (landscape path), so height is constrained to 256
    // Both sides should be 256
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
  });

  test("cache hit returns same object reference", async () => {
    const blob = await createTestImage(400, 400);
    const cacheKey = "test-cache-hit";

    const result1 = await resizeAvatar(blob, "image/png", 128, cacheKey);
    const result2 = await resizeAvatar(blob, "image/png", 128, cacheKey);

    // Same reference — came from cache
    expect(result1).toBe(result2);
    expect(result1.buffer).toBe(result2.buffer);
  });

  test("different cache keys produce independent results", async () => {
    const blob = await createTestImage(400, 400);

    const result1 = await resizeAvatar(blob, "image/png", 128, "key-a");
    const result2 = await resizeAvatar(blob, "image/png", 128, "key-b");

    // Different cache keys → different objects (even if same content)
    expect(result1).not.toBe(result2);
  });

  test("different sizes on same key produce independent results", async () => {
    const blob = await createTestImage(800, 800);

    const small = await resizeAvatar(blob, "image/png", 128, "size-test");
    const large = await resizeAvatar(blob, "image/png", 512, "size-test");

    expect(small).not.toBe(large);

    const smallMeta = await sharp(small.buffer).metadata();
    const largeMeta = await sharp(large.buffer).metadata();
    expect(smallMeta.width).toBe(128);
    expect(largeMeta.width).toBe(512);
  });

  test("output is always smaller than or equal to input", async () => {
    const blob = await createTestImage(1024, 1024);
    const result = await resizeAvatar(blob, "image/png", 256, "size-compare");

    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBeLessThanOrEqual(1024);
    expect(meta.height).toBeLessThanOrEqual(1024);
  });

  test("handles size=0 as falsy (passthrough)", async () => {
    const blob = await createTestImage(300, 300);
    // size 0 is falsy — should passthrough like null
    const result = await resizeAvatar(blob, "image/jpeg", 0 as any, "zero-size");
    expect(result.buffer).toBe(blob);
    expect(result.mime).toBe("image/jpeg");
  });
});
