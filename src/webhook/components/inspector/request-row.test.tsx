// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RequestRow } from "./request-row";
import type { PolledRequest } from "./use-requests";

const row = (overrides: Partial<PolledRequest> = {}): PolledRequest => ({
  id: "r1",
  method: "POST",
  path: "/orders/9182",
  query: "",
  headers: {},
  body: Buffer.from("{}").toString("base64"),
  truncated: false,
  createdAt: 0,
  ...overrides,
});

describe("RequestRow", () => {
  it("renders the method, path and a relative time + byte size line", () => {
    render(<RequestRow request={row({ createdAt: Date.now() - 5000 })} selected={false} now={Date.now()} onSelect={() => {}} />);
    expect(screen.getByText("POST")).toBeTruthy();
    expect(screen.getByText("/orders/9182")).toBeTruthy();
    expect(screen.getByText("5s ago")).toBeTruthy();
    expect(screen.getByText("2 B")).toBeTruthy();
  });

  it("appends the query string to the path", () => {
    render(<RequestRow request={row({ query: "a=1" })} selected={false} now={0} onSelect={() => {}} />);
    expect(screen.getByText("/orders/9182?a=1")).toBeTruthy();
  });

  it("marks a truncated body", () => {
    render(<RequestRow request={row({ truncated: true })} selected={false} now={0} onSelect={() => {}} />);
    expect(screen.getByText("truncated")).toBeTruthy();
  });

  it("calls onSelect when clicked and flags fresh rows with the in class", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <RequestRow request={row({ fresh: true })} selected={false} now={0} onSelect={onSelect} />,
    );
    expect(container.querySelector("button")?.className).toContain("wh-row-in");
    fireEvent.click(screen.getByText("POST"));
    expect(onSelect).toHaveBeenCalled();
  });

  it("marks the selected row with an aria-current and a selected background", () => {
    const { container } = render(<RequestRow request={row()} selected={true} now={0} onSelect={() => {}} />);
    expect(container.querySelector("button")?.getAttribute("aria-current")).toBe("true");
    expect(container.querySelector("button")?.className).toContain("bg-accent");
  });
});