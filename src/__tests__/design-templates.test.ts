import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { DESIGN_TEMPLATES } from "../shared/design-templates.ts";
import { installHappyDom } from "./test-dom.ts";

const { restore } = installHappyDom("https://proseus.test/settings");
const {
  DESIGN_TEMPLATE_CHANGE_EVENT,
  DESIGN_TEMPLATE_STORAGE_KEY,
  applyDesignTemplate,
  applyStoredDesignTemplate,
  getActiveDesignTemplateId,
  getStoredDesignTemplateId,
  setStoredDesignTemplateId,
} = await import("../client/lib/design-templates.ts");

const LEGACY_STORAGE_KEY = "proseus:design-pack";

afterAll(() => {
  restore();
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-design-template");
});

describe("design-templates", () => {
  test("falls back to forge when nothing is stored", () => {
    expect(getStoredDesignTemplateId()).toBe("forge");
  });

  test("migrates the legacy storage key", () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, "discord");

    expect(getStoredDesignTemplateId()).toBe("discord");
    expect(localStorage.getItem(DESIGN_TEMPLATE_STORAGE_KEY)).toBe("discord");
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  test("ignores invalid stored values", () => {
    localStorage.setItem(DESIGN_TEMPLATE_STORAGE_KEY, "unknown-theme");

    expect(getStoredDesignTemplateId()).toBe("forge");
  });

  test("setStoredDesignTemplateId updates storage and clears the legacy key", () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, "discord");

    setStoredDesignTemplateId("chub");

    expect(localStorage.getItem(DESIGN_TEMPLATE_STORAGE_KEY)).toBe("chub");
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  test("applyDesignTemplate updates the DOM and dispatches a change event", () => {
    const received: string[] = [];
    window.addEventListener(DESIGN_TEMPLATE_CHANGE_EVENT, ((event: Event) => {
      received.push((event as CustomEvent<string>).detail);
    }) as EventListener);

    applyDesignTemplate("discord");

    const style = document.getElementById("proseus-design-template");

    expect(document.documentElement.dataset.designTemplate).toBe("discord");
    expect(style?.textContent).toContain("--color-background");
    expect(style?.textContent).toContain(
      DESIGN_TEMPLATES.discord.tokenOverrides["--color-background"]!,
    );
    expect(received).toEqual(["discord"]);
  });

  test("getActiveDesignTemplateId prefers the active DOM dataset", () => {
    setStoredDesignTemplateId("forge");
    document.documentElement.dataset.designTemplate = "chub";

    expect(getActiveDesignTemplateId()).toBe("chub");
  });

  test("applyStoredDesignTemplate applies the stored template and returns it", () => {
    setStoredDesignTemplateId("chub");

    const applied = applyStoredDesignTemplate();

    expect(applied).toBe("chub");
    expect(document.documentElement.dataset.designTemplate).toBe("chub");
    expect(document.getElementById("proseus-design-template")?.textContent).toContain(
      "--color-background",
    );
  });
});
