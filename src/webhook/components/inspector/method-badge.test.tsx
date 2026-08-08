// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MethodBadge } from "./method-badge";

describe("MethodBadge", () => {
  it("renders the method verbatim with an uppercase CSS class", () => {
    const { container } = render(<MethodBadge method="post" />);
    expect(screen.getByText("post")).toBeTruthy();
    expect(container.querySelector("span")?.className).toContain("uppercase");
  });

  it("row size is compact, detail size is wider", () => {
    const { container } = render(<MethodBadge method="GET" size="row" />);
    expect(container.querySelector("span")?.className).toContain("w-[54px]");
    const { container: detail } = render(<MethodBadge method="GET" size="detail" />);
    expect(detail.querySelector("span")?.className).toContain("px-2");
  });

  it.each([
    ["GET", "text-muted-foreground"],
    ["HEAD", "text-muted-foreground"],
    ["DELETE", "text-destructive"],
    ["POST", "bg-primary"],
  ])("applies the %s tone class", (method, tone) => {
    const { container } = render(<MethodBadge method={method} />);
    expect(container.querySelector("span")?.className).toContain(tone);
  });
});