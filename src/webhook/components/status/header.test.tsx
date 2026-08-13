// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatusHeader } from "./header";
import { THEME_STORAGE_KEY } from "@/components/theme";

describe("StatusHeader", () => {
  it("shows the brand, the /status badge, the Inspector link and the last-updated age", () => {
    render(<StatusHeader updatedAgo="updated 2s ago" />);
    expect(screen.getByText("website·hook")).toBeTruthy();
    expect(screen.getByText("/status")).toBeTruthy();
    expect(screen.getByText("updated 2s ago")).toBeTruthy();

    const inspector = screen.getByText("Inspector");
    expect(inspector).toBeTruthy();
    expect(inspector.closest("a")?.getAttribute("href")).toBe("/");
  });

  it("renders a theme toggle button", () => {
    render(<StatusHeader updatedAgo="" />);
    expect(screen.getByTitle("Toggle theme")).toBeTruthy();
  });

  it("toggles the dark theme and persists the choice", () => {
    render(<StatusHeader updatedAgo="" />);
    const toggle = screen.getByTitle("Toggle theme");

    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
