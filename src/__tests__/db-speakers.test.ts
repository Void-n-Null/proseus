import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/db/schema.ts";
import {
  createSpeaker,
  getSpeaker,
  listSpeakers,
  updateSpeaker,
  deleteSpeaker,
} from "../server/db/speakers.ts";

describe("speakers", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  test("createSpeaker: with all fields", () => {
    const speaker = createSpeaker(db, {
      name: "Assistant",
      is_user: false,
      color: "#7c3aed",
    });

    expect(speaker.id).toBeTruthy();
    expect(speaker.id).toHaveLength(12);
    expect(speaker.name).toBe("Assistant");
    expect(speaker.is_user).toBe(false);
    expect(speaker.color).toBe("#7c3aed");
    expect(speaker.avatar_url).toBeNull();
    expect(speaker.created_at).toBeGreaterThan(0);
  });

  test("createSpeaker: with minimal fields (null color)", () => {
    const speaker = createSpeaker(db, {
      name: "User",
      is_user: true,
    });

    expect(speaker.id).toBeTruthy();
    expect(speaker.name).toBe("User");
    expect(speaker.is_user).toBe(true);
    expect(speaker.color).toBeNull();
    expect(speaker.avatar_url).toBeNull();
  });

  test("getSpeaker: by id", () => {
    const created = createSpeaker(db, {
      name: "Test",
      is_user: false,
      color: "#ff0000",
    });

    const fetched = getSpeaker(db, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe("Test");
    expect(fetched!.is_user).toBe(false);
    expect(fetched!.color).toBe("#ff0000");
  });

  test("getSpeaker: returns null for nonexistent id", () => {
    const result = getSpeaker(db, "nonexistent");
    expect(result).toBeNull();
  });

  test("listSpeakers: returns all", () => {
    createSpeaker(db, { name: "User", is_user: true });
    createSpeaker(db, { name: "Bot 1", is_user: false, color: "#aaa" });
    createSpeaker(db, { name: "Bot 2", is_user: false, color: "#bbb" });

    const all = listSpeakers(db);
    expect(all).toHaveLength(3);

    const names = all.map((s) => s.name);
    expect(names).toContain("User");
    expect(names).toContain("Bot 1");
    expect(names).toContain("Bot 2");
  });

  test("updateSpeaker: name and color", () => {
    const speaker = createSpeaker(db, {
      name: "Original",
      is_user: false,
      color: "#000",
    });

    const updated = updateSpeaker(db, speaker.id, {
      name: "Renamed",
      color: "#fff",
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Renamed");
    expect(updated!.color).toBe("#fff");

    // Verify through getSpeaker
    const fetched = getSpeaker(db, speaker.id);
    expect(fetched!.name).toBe("Renamed");
    expect(fetched!.color).toBe("#fff");
  });

  test("updateSpeaker: partial update (only name)", () => {
    const speaker = createSpeaker(db, {
      name: "Original",
      is_user: false,
      color: "#123",
    });

    const updated = updateSpeaker(db, speaker.id, { name: "New Name" });
    expect(updated!.name).toBe("New Name");
    expect(updated!.color).toBe("#123"); // unchanged
  });

  test("updateSpeaker: returns null for nonexistent id", () => {
    const result = updateSpeaker(db, "nonexistent", { name: "test" });
    expect(result).toBeNull();
  });

  test("deleteSpeaker: removes speaker", () => {
    const speaker = createSpeaker(db, { name: "ToDelete", is_user: false });

    const deleted = deleteSpeaker(db, speaker.id);
    expect(deleted).toBe(true);

    const fetched = getSpeaker(db, speaker.id);
    expect(fetched).toBeNull();
  });

  test("deleteSpeaker: returns false for nonexistent id", () => {
    const result = deleteSpeaker(db, "nonexistent");
    expect(result).toBe(false);
  });

  test("getSpeaker: avatar_url computed when avatar_blob exists", () => {
    const speaker = createSpeaker(db, { name: "Avatar Test", is_user: false });

    // Manually insert avatar blob to test the computed URL
    db.query(
      `UPDATE speakers SET avatar_blob = $blob, avatar_mime = $mime WHERE id = $id`,
    ).run({
      $blob: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      $mime: "image/png",
      $id: speaker.id,
    });

    const fetched = getSpeaker(db, speaker.id);
    expect(fetched!.avatar_url).toBe(`/api/speakers/${speaker.id}/avatar`);
  });
});
