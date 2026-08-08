// @vitest-environment happy-dom
import "@/test/component-setup";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "./theme-toggle";
import { THEME_STORAGE_KEY } from "@/components/theme";

beforeEach(() => {
  document.documentElement.classList.remove("dark");
  window.localStorage.removeItem(THEME_STORAGE_KEY);
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
  window.localStorage.removeItem(THEME_STORAGE_KEY);
});

describe("ThemeToggle", () => {
  it("renders the moon in light mode and toggles to dark, persisting the choice", () => {
    render(<ThemeToggle />);
    expect(screen.getByLabelText("Switch to dark theme")).toBeTruthy();
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    fireEvent.click(screen.getByLabelText("Switch to dark theme"));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByLabelText("Switch to light theme")).toBeTruthy();
  });

  it("toggles back to light and persists light", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByLabelText("Switch to dark theme"));
    fireEvent.click(screen.getByLabelText("Switch to light theme"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("survives a blocked localStorage (toggle still works, persistence skipped)", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {},
      },
    });
    render(<ThemeToggle />);
    expect(() => fireEvent.click(screen.getByLabelText("Switch to dark theme"))).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    if (original) Object.defineProperty(window, "localStorage", original);
  });
});