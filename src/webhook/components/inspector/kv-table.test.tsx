// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KvTable } from "./kv-table";

describe("KvTable", () => {
  it("shows the empty message when there are no rows", () => {
    render(<KvTable keyLabel="Header" rows={[]} emptyMessage="No headers" />);
    expect(screen.getByText("No headers")).toBeTruthy();
  });

  it("renders a header row and each key/value as text", () => {
    render(
      <KvTable
        keyLabel="Header"
        rows={[
          { key: "content-type", value: "application/json" },
          { key: "x-token", value: "sekret" },
        ]}
      />,
    );
    expect(screen.getByText("Header")).toBeTruthy();
    expect(screen.getByText("content-type")).toBeTruthy();
    expect(screen.getByText("application/json")).toBeTruthy();
    expect(screen.getByText("x-token")).toBeTruthy();
    expect(screen.getByText("sekret")).toBeTruthy();
  });

  it("a sensitive header name is highlighted when requested", () => {
    const { container } = render(
      <KvTable keyLabel="Header" rows={[{ key: "authorization", value: "Bearer x" }]} highlightSensitive />,
    );
    const keyCell = container.querySelector(".text-primary");
    expect(keyCell?.textContent).toBe("authorization");
  });

  it("renders captured markup values as inert text, never as elements", () => {
    const { container } = render(
      <KvTable keyLabel="Header" rows={[{ key: "x-markup", value: "<script>alert(1)</script>" }]} />,
    );
    expect(container.querySelectorAll("script")).toHaveLength(0);
    expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy();
  });
});