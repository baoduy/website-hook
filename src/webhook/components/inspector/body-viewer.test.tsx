// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BodyViewer } from "./body-viewer";

const enc = (t: string) => Buffer.from(t, "utf-8").toString("base64");

describe("BodyViewer", () => {
  it("renders a JSON body as a syntax-coloured, gutter-numbered block", () => {
    const { container } = render(<BodyViewer body={enc('{"a":1}')} truncated={false} />);
    // gutter numbers (1..2) and a value-number class are both present
    expect(container.querySelectorAll("[class*='text-code-num']").length).toBeGreaterThan(0);
    expect(screen.getByText('"a"')).toBeTruthy();
  });

  it("renders a non-JSON text body in a raw pane with a 'not JSON' kicker", () => {
    render(<BodyViewer body={enc("just text")} truncated={false} />);
    expect(screen.getByText("Body — not JSON, shown raw")).toBeTruthy();
    expect(screen.getByText("just text")).toBeTruthy();
  });

  it("renders an empty body as '(empty body)'", () => {
    render(<BodyViewer body="" truncated={false} />);
    expect(screen.getByText("(empty body)")).toBeTruthy();
  });

  it("renders a binary body with a byte-size label", () => {
    render(<BodyViewer body={Buffer.from([0xff]).toString("base64")} truncated={false} />);
    expect(screen.getByText(/binary body/)).toBeTruthy();
  });

  it("shows the truncation warning when truncated is true", () => {
    render(<BodyViewer body={enc("x")} truncated={true} />);
    expect(screen.getByText(/stored truncated/)).toBeTruthy();
  });

  it("renders captured markup as inert text, never as an element", () => {
    const { container } = render(<BodyViewer body={enc("<script>alert(1)</script>")} truncated={false} />);
    expect(container.querySelectorAll("script")).toHaveLength(0);
    expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy();
  });
});