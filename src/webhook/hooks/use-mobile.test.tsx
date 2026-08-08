// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIsMobile } from "@/hooks/use-mobile";

describe("useIsMobile", () => {
  it("reports false when the viewport is at or above the 768px breakpoint", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    (window.matchMedia as unknown as (q: string) => MediaQueryList) = (query: string) =>
      ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("reports true when the viewport is below the breakpoint", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });
});