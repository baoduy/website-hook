// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RetentionPanel } from "./retention-panel";
import type { Storage } from "@/lib/statistics";

const storage: Storage = { webhooks: 26, capturedRequests: 4310, oldWebhooks: 3, oldRequests: 512, oldBytes: 8_808_038 };

describe("RetentionPanel", () => {
  it("renders the storage totals and the over-30-day figures", () => {
    render(<RetentionPanel storage={storage} preview={{ webhooks: [], totalRequests: 0 }} onCleanup={() => {}} />);
    expect(screen.getByText("Stored webhooks")).toBeTruthy();
    expect(screen.getByText("26")).toBeTruthy();
    expect(screen.getByText("Stored requests")).toBeTruthy();
    expect(screen.getByText("4,310")).toBeTruthy();
    expect(screen.getByText("Created over 30 days ago")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("512 · 8.40 MB")).toBeTruthy();
  });

  it("disables the clean-up action and says so when nothing is old enough", () => {
    render(<RetentionPanel storage={storage} preview={{ webhooks: [], totalRequests: 0 }} onCleanup={() => {}} />);
    const button = screen.getByText("Nothing older than 30 days");
    expect(button).toBeTruthy();
    expect(button.closest("button")?.hasAttribute("disabled")).toBe(true);
  });

  it("enables the clean-up action and states the webhook and request count when there are targets", () => {
    render(
      <RetentionPanel
        storage={storage}
        preview={{ webhooks: [{ id: "7b19aa03", requestCount: 12 }], totalRequests: 12 }}
        onCleanup={() => {}}
      />,
    );
    const button = screen.getByText("Delete 1 webhook + 12 requests");
    expect(button).toBeTruthy();
    expect(button.closest("button")?.hasAttribute("disabled")).toBe(false);
  });

  it("renders nothing when storage is not yet loaded", () => {
    render(<RetentionPanel storage={null} preview={null} onCleanup={() => {}} />);
    expect(screen.queryByText("Stored webhooks")).toBeNull();
  });

  it("calls onCleanup when the confirmed delete action is triggered", async () => {
    const onCleanup = vi.fn();
    const user = userEvent.setup();
    render(
      <RetentionPanel
        storage={storage}
        preview={{ webhooks: [{ id: "7b19aa03", requestCount: 12 }], totalRequests: 12 }}
        onCleanup={onCleanup}
      />,
    );
    // Open the confirm dialog and press the destructive action.
    await user.click(screen.getByText("Delete 1 webhook + 12 requests"));
    await waitFor(() => expect(screen.getByText("Delete everything older than 30 days?")).toBeTruthy());
    expect(screen.getByText("7b19aa03")).toBeTruthy();
    await user.click(screen.getByText("Delete 1 webhook"));
    expect(onCleanup).toHaveBeenCalled();
  });
});
