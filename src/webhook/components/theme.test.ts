// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme";

describe("theme module", () => {
  it("exposes a non-secret storage key for the theme choice only", () => {
    expect(THEME_STORAGE_KEY).toBe("website-hook:theme");
  });

  it("init script reads the stored theme key and falls back to the OS preference", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_INIT_SCRIPT).toContain("prefers-color-scheme");
    expect(THEME_INIT_SCRIPT).toContain("classList.toggle(\"dark\"");
    // runs before paint, so it must not await anything
    expect(THEME_INIT_SCRIPT).not.toContain("await");
  });
});