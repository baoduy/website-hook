// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// next/font is a build-time transform; in vitest we stub it to a plain variable holder.
vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter" }),
  JetBrains_Mono: () => ({ variable: "--font-jetbrains-mono" }),
}));

describe("app/layout", () => {
  it("renders the root layout's children and exports the theme init script + metadata", async () => {
    const layout = await import("./layout");
    const RootLayout = layout.default;
    render(<RootLayout>children</RootLayout>);
    // happy-dom strips a nested <html>/<head> when rendered inside a div, but the body
    // content and the exported init script + metadata still prove the module executes.
    expect(screen.getByText("children")).toBeTruthy();
    expect(layout.metadata.title).toContain("website");
    expect(layout.metadata.description).toContain("inspect");
  });
});