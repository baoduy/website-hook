// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WebhookList } from "./webhook-list";
import type { RememberedWebhook } from "./use-webhooks";

const mk = (overrides: Partial<RememberedWebhook> = {}): RememberedWebhook => ({
  id: "w1",
  summary: { id: "w1", createdAt: 0, lastActivityAt: 0, requestCount: 3, expiresAt: 0 },
  gone: false,
  ...overrides,
});

describe("WebhookList", () => {
  it("renders an empty hint when nothing is remembered", () => {
    render(
      <WebhookList webhooks={[]} selectedId={null} atCap={false} creating={false} onSelect={() => {}} onCreate={() => {}} onForget={() => {}} />,
    );
    expect(screen.getByText("Nothing remembered in this browser yet.")).toBeTruthy();
  });

  it("lists each webhook with its request count and marks the selected one", () => {
    const { container } = render(
      <WebhookList
        webhooks={[mk({ id: "a" }), mk({ id: "b", summary: { ...mk().summary!, id: "b", requestCount: 0 } })]}
        selectedId="a"
        atCap={false}
        creating={false}
        onSelect={() => {}}
        onCreate={() => {}}
        onForget={() => {}}
      />,
    );
    expect(screen.getByText("3")).toBeTruthy();
    expect(container.querySelector('[aria-current="true"]')).toBeTruthy();
  });

  it("disables the new-webhook button and shows the cap hint at the cap", () => {
    render(
      <WebhookList webhooks={[mk()]} selectedId="w1" atCap={true} creating={false} onSelect={() => {}} onCreate={() => {}} onForget={() => {}} />,
    );
    const button = screen.getByLabelText("New webhook") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/five webhooks at a time/)).toBeTruthy();
  });

  it("disables the button while creating", () => {
    render(
      <WebhookList webhooks={[]} selectedId={null} atCap={false} creating={true} onSelect={() => {}} onCreate={() => {}} onForget={() => {}} />,
    );
    expect((screen.getByLabelText("New webhook") as HTMLButtonElement).disabled).toBe(true);
  });

  it("creates on click of the new button", () => {
    const onCreate = vi.fn();
    render(<WebhookList webhooks={[]} selectedId={null} atCap={false} creating={false} onSelect={() => {}} onCreate={onCreate} onForget={() => {}} />);
    fireEvent.click(screen.getByLabelText("New webhook"));
    expect(onCreate).toHaveBeenCalled();
  });

  it("selects a webhook on row click", () => {
    const onSelect = vi.fn();
    render(<WebhookList webhooks={[mk({ id: "a" })]} selectedId={null} atCap={false} creating={false} onSelect={onSelect} onCreate={() => {}} onForget={() => {}} />);
    fireEvent.click(screen.getByText(/a/));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("shows an expired webhook inert with a remove control", () => {
    const onForget = vi.fn();
    render(<WebhookList webhooks={[mk({ id: "gone-1", gone: true })]} selectedId={null} atCap={false} creating={false} onSelect={() => {}} onCreate={() => {}} onForget={onForget} />);
    expect(screen.getByText("Expired — remove")).toBeTruthy();
    fireEvent.click(screen.getByText("Expired — remove"));
    expect(onForget).toHaveBeenCalledWith("gone-1");
  });
});