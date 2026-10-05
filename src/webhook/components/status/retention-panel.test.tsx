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
    render(<RetentionPanel storage={storage} preview={{ webhooks: [], totalRequests: 0, webhookTtlDays: 7 }} onCleanup={() => {}} />);
    expect(screen.getByText("Stored webhooks")).toBeTruthy();
    expect(screen.getByText("26")).toBeTruthy();
    expect(screen.getByText("Stored requests")).toBeTruthy();
    expect(screen.getByText("4,310")).toBeTruthy();
    expect(screen.getByText("Created over 30 days ago")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("512 · 8.40 MB")).toBeTruthy();
  });

  it("disables the clean-up action and says so when nothing is old enough", () => {
    render(<RetentionPanel storage={storage} preview={{ webhooks: [], totalRequests: 0, webhookTtlDays: 7 }} onCleanup={() => {}} />);
    const button = screen.getByText("Nothing older than 30 days");
    expect(button).toBeTruthy();
    expect(button.closest("button")?.hasAttribute("disabled")).toBe(true);
  });

  it("enables the clean-up action and states the webhook and request count when there are targets", () => {
    render(
      <RetentionPanel
        storage={storage}
        preview={{ webhooks: [{ id: "7b19aa03", requestCount: 12 }], totalRequests: 12, webhookTtlDays: 7 }}
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
        preview={{ webhooks: [{ id: "7b19aa03", requestCount: 12 }], totalRequests: 12, webhookTtlDays: 7 }}
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

  describe("retention note and clean-up button follow the idle-period setting (DRK-2061)", () => {
    const target = { id: "7b19aa03", requestCount: 12 };

    it('setting "0": says webhooks never expire, without the 30-day sentence, and disables clean-up', () => {
      render(
        <RetentionPanel storage={storage} preview={{ webhooks: [], totalRequests: 0, webhookTtlDays: null }} onCleanup={() => {}} />,
      );
      expect(screen.getByText("Webhooks never expire on this deployment.").tagName).toBe("P");
      expect(screen.queryByText(/This clears anything created over 30 days ago/)).toBeNull();
      expect(screen.getByText("Nothing older than 30 days").closest("button")?.hasAttribute("disabled")).toBe(true);
    });

    it.each([
      { setting: '"30"', days: 30 },
      { setting: "not set", days: 7 },
    ])("setting $setting: states the $days-day idle period with the 30-day sentence and enables clean-up", ({ days }) => {
      render(
        <RetentionPanel
          storage={storage}
          preview={{ webhooks: [target], totalRequests: 12, webhookTtlDays: days }}
          onCleanup={() => {}}
        />,
      );
      const note = screen.getByText(
        `New webhooks are deleted after ${days} idle days. This clears anything created over 30 days ago, however recently it was hit.`,
      );
      expect(note.tagName).toBe("P");
      expect(screen.getByText("Delete 1 webhook + 12 requests").closest("button")?.hasAttribute("disabled")).toBe(false);
    });

    it("shows no retention note while the preview is still loading", () => {
      render(<RetentionPanel storage={storage} preview={null} onCleanup={() => {}} />);
      expect(screen.getByText("Stored webhooks")).toBeTruthy();
      expect(screen.queryByText(/Webhooks never expire|New webhooks are deleted/)).toBeNull();
      expect(screen.getByText("Nothing older than 30 days").closest("button")?.hasAttribute("disabled")).toBe(true);
    });
  });
});
