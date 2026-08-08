// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/inspector/api");

// smoke: the root page renders the inspector shell, reserving no webhook endpoint path
// (the [id] route still claims every single-segment path; "/" is the inspector's own).
describe("app/page", () => {
  it("mounts the Inspector and shows the empty-webhook state at /", async () => {
    const Page = (await import("./page")).default;
    render(<Page />);
    await waitFor(() => expect(screen.getByText("Nothing remembered in this browser yet.")).toBeTruthy());
  });
});