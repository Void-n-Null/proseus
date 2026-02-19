import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../server/db/schema.ts";
import {
  createPersona,
  getPersona,
  listPersonas,
  updatePersona,
  setPersonaAvatar,
  getPersonaAvatar,
  deletePersona,
  getPersonaForChat,
  getGlobalPersona,
} from "../server/db/personas.ts";
import { createChat } from "../server/db/chats.ts";
import { createSpeaker } from "../server/db/speakers.ts";
import { updateChat } from "../server/db/chats.ts";

describe("personas", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  test("createPersona: stores all fields and returns correct shape", () => {
    const persona = createPersona(db, {
      name: "Blake",
      prompt: "I am a sci-fi writer.",
      is_global: true,
    });

    expect(persona.id).toBeTruthy();
    expect(persona.name).toBe("Blake");
    expect(persona.prompt).toBe("I am a sci-fi writer.");
    expect(persona.is_global).toBe(true);
    expect(persona.avatar_url).toBeNull();
    expect(persona.created_at).toBeGreaterThan(0);
    expect(persona.updated_at).toBe(persona.created_at);
  });

  test("createPersona: defaults prompt to '' and is_global to false", () => {
    const persona = createPersona(db, { name: "Minimal" });

    expect(persona.prompt).toBe("");
    expect(persona.is_global).toBe(false);
  });

  test("getPersona: fetches by id", () => {
    const created = createPersona(db, { name: "Alice", prompt: "Hello" });
    const fetched = getPersona(db, created.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe("Alice");
    expect(fetched!.prompt).toBe("Hello");
  });

  test("getPersona: returns null for nonexistent id", () => {
    expect(getPersona(db, "nonexistent")).toBeNull();
  });

  test("listPersonas: returns all, ordered by created_at ASC", () => {
    createPersona(db, { name: "First" });
    createPersona(db, { name: "Second" });
    createPersona(db, { name: "Third" });

    const personas = listPersonas(db);
    expect(personas).toHaveLength(3);
    expect(personas[0]!.name).toBe("First");
    expect(personas[1]!.name).toBe("Second");
    expect(personas[2]!.name).toBe("Third");
  });

  test("listPersonas: returns empty array when no personas exist", () => {
    expect(listPersonas(db)).toHaveLength(0);
  });

  test("updatePersona: updates name and prompt", () => {
    const persona = createPersona(db, { name: "Old", prompt: "old prompt" });
    const updated = updatePersona(db, persona.id, {
      name: "New",
      prompt: "new prompt",
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("New");
    expect(updated!.prompt).toBe("new prompt");
    expect(updated!.updated_at).toBeGreaterThanOrEqual(persona.updated_at);
  });

  test("updatePersona: partial update preserves untouched fields", () => {
    const persona = createPersona(db, {
      name: "Keep",
      prompt: "keep me",
      is_global: true,
    });

    const updated = updatePersona(db, persona.id, { name: "Renamed" });
    expect(updated!.prompt).toBe("keep me");
    expect(updated!.is_global).toBe(true);
  });

  test("updatePersona: can toggle is_global", () => {
    const persona = createPersona(db, { name: "Test", is_global: false });
    const updated = updatePersona(db, persona.id, { is_global: true });
    expect(updated!.is_global).toBe(true);
  });

  test("updatePersona: returns null for nonexistent id", () => {
    expect(updatePersona(db, "nonexistent", { name: "x" })).toBeNull();
  });

  test("setPersonaAvatar: stores blob and mime, avatar_url becomes non-null", () => {
    const persona = createPersona(db, { name: "Avatar Test" });
    const fakeBlob = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    const ok = setPersonaAvatar(db, persona.id, fakeBlob, "image/png");

    expect(ok).toBe(true);

    const fetched = getPersona(db, persona.id);
    expect(fetched!.avatar_url).toBe(`/api/personas/${persona.id}/avatar`);
  });

  test("getPersonaAvatar: returns blob and mime after upload", () => {
    const persona = createPersona(db, { name: "Avatar Test" });
    const fakeBlob = new Uint8Array([1, 2, 3, 4]);
    setPersonaAvatar(db, persona.id, fakeBlob, "image/jpeg");

    const result = getPersonaAvatar(db, persona.id);
    expect(result).not.toBeNull();
    expect(result!.mime).toBe("image/jpeg");
    expect(result!.avatar).toEqual(fakeBlob);
  });

  test("getPersonaAvatar: returns null when no avatar set", () => {
    const persona = createPersona(db, { name: "No Avatar" });
    expect(getPersonaAvatar(db, persona.id)).toBeNull();
  });

  test("setPersonaAvatar: returns false for nonexistent id", () => {
    const ok = setPersonaAvatar(db, "nonexistent", new Uint8Array([1]), "image/png");
    expect(ok).toBe(false);
  });

  test("deletePersona: removes the persona", () => {
    const persona = createPersona(db, { name: "Delete Me" });
    const deleted = deletePersona(db, persona.id);

    expect(deleted).toBe(true);
    expect(getPersona(db, persona.id)).toBeNull();
  });

  test("deletePersona: returns false for nonexistent id", () => {
    expect(deletePersona(db, "nonexistent")).toBe(false);
  });

  test("getPersonaForChat: returns null when chat has no persona", () => {
    const user = createSpeaker(db, { name: "User", is_user: true });
    const chat = createChat(db, { name: "No Persona Chat", speaker_ids: [user.id] });

    expect(getPersonaForChat(db, chat.id)).toBeNull();
  });

  test("getPersonaForChat: returns persona after linking", () => {
    const user = createSpeaker(db, { name: "User", is_user: true });
    const chat = createChat(db, { name: "Linked Chat", speaker_ids: [user.id] });
    const persona = createPersona(db, { name: "Writer", prompt: "I write." });

    updateChat(db, chat.id, { persona_id: persona.id });

    const result = getPersonaForChat(db, chat.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(persona.id);
    expect(result!.name).toBe("Writer");
  });

  test("getGlobalPersona: returns null when no global persona exists", () => {
    createPersona(db, { name: "Local", is_global: false });
    expect(getGlobalPersona(db)).toBeNull();
  });

  test("getGlobalPersona: returns the global persona", () => {
    createPersona(db, { name: "Local", is_global: false });
    const global = createPersona(db, { name: "Global One", is_global: true });
    const result = getGlobalPersona(db);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(global.id);
  });

  test("getGlobalPersona: returns null after is_global is unset", () => {
    const persona = createPersona(db, { name: "Was Global", is_global: true });
    updatePersona(db, persona.id, { is_global: false });
    expect(getGlobalPersona(db)).toBeNull();
  });

  test("getPersonaForChat: returns null after persona is unlinked (set to null)", () => {
    const user = createSpeaker(db, { name: "User", is_user: true });
    const chat = createChat(db, { name: "Chat", speaker_ids: [user.id] });
    const persona = createPersona(db, { name: "Temp" });

    updateChat(db, chat.id, { persona_id: persona.id });
    updateChat(db, chat.id, { persona_id: null });

    expect(getPersonaForChat(db, chat.id)).toBeNull();
  });
});
