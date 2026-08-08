// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeleteWebhookDialog } from "./delete-webhook-dialog";

describe("DeleteWebhookDialog", () => {
  it("is not open initially when open=false", () => {
    render(<DeleteWebhookDialog open={false} endpointUrl="https://x/w1" onOpenChange={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByText("Delete this webhook?")).toBeNull();
  });

  it("shows the title and the endpoint url when open", () => {
    render(<DeleteWebhookDialog open={true} endpointUrl="https://x/w1" onOpenChange={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("Delete this webhook?")).toBeTruthy();
    expect(screen.getByText("https://x/w1")).toBeTruthy();
  });

  it("omits the url block when endpointUrl is null", () => {
    render(<DeleteWebhookDialog open={true} endpointUrl={null} onOpenChange={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("Delete this webhook?")).toBeTruthy();
  });

  it("calls onConfirm when the delete action is clicked", () => {
    const onConfirm = vi.fn();
    render(<DeleteWebhookDialog open={true} endpointUrl="https://x/w1" onOpenChange={() => {}} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Delete webhook"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onOpenChange(false) when cancel is clicked", () => {
    const onOpenChange = vi.fn();
    render(<DeleteWebhookDialog open={true} endpointUrl="https://x/w1" onOpenChange={onOpenChange} onConfirm={() => {}} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});