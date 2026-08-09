// @vitest-environment happy-dom
import "@/test/component-setup";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider } from "@/components/ui/sidebar";
import { EndpointBar } from "./endpoint-bar";

const props = {
  webhookId: "wh-1" as string | null,
  endpointUrl: "https://hook.example/wh-1" as string | null,
  atCap: false,
  atCapMessage: "cap",
  creating: false,
  onCreate: vi.fn(),
  onDelete: vi.fn(),
};

beforeEach(() => {
  props.onCreate = vi.fn();
  props.onDelete = vi.fn();
});

const renderBar = (p: Partial<typeof props> = {}) =>
  render(
    <SidebarProvider>
      <EndpointBar {...props} {...p} />
    </SidebarProvider>,
  );

describe("EndpointBar", () => {
  it("shows the webhook id path or a dash when none is selected", () => {
    const { rerender } = renderBar();
    expect(screen.getByText("/wh-1")).toBeTruthy();
    rerender(
      <SidebarProvider>
        <EndpointBar {...props} webhookId={null} endpointUrl={null} />
      </SidebarProvider>,
    );
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("disables copy when there is no endpoint url", () => {
    renderBar({ webhookId: null, endpointUrl: null });
    expect((screen.getByText("Copy URL") as HTMLButtonElement).disabled).toBe(true);
  });

  it("copies the endpoint url to the clipboard and flashes Copied", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderBar();
    fireEvent.click(screen.getByText("Copy URL"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("https://hook.example/wh-1");
    expect(screen.getByText("Copied")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });
    expect(screen.getByText("Copy URL")).toBeTruthy();
    vi.useRealTimers();
  });

  it("reports copy unavailable when clipboard is absent", () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    renderBar();
    fireEvent.click(screen.getByText("Copy URL"));
    expect(screen.getByText(/Copy unavailable/)).toBeTruthy();
  });

  it("reports copy unavailable when writeText rejects", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderBar();
    await act(async () => {
      await user.click(screen.getByText("Copy URL"));
    });
    expect(screen.getByText(/Copy unavailable/)).toBeTruthy();
  });

  it("opens the actions menu and triggers create / delete", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByLabelText("Webhook actions"));
    const newItems = await screen.findAllByRole("menuitem", { name: /New webhook/ });
    await user.click(newItems[0]);
    expect(props.onCreate).toHaveBeenCalled();
    await user.click(screen.getByLabelText("Webhook actions"));
    const delItems = await screen.findAllByRole("menuitem", { name: /Delete webhook/ });
    await user.click(delItems[0]);
    expect(props.onDelete).toHaveBeenCalled();
  });

  it("disables the new-webhook action at the cap and shows the cap title", async () => {
    const user = userEvent.setup();
    renderBar({ atCap: true });
    await user.click(screen.getByLabelText("Webhook actions"));
    const item = (await screen.findByRole("menuitem", { name: /New webhook/ })) as HTMLElement;
    expect(item.getAttribute("aria-disabled") ?? item.getAttribute("data-disabled") ?? item.getAttribute("disabled")).not.toBeNull();
  });

  it("disables the delete action when no webhook is selected", async () => {
    const user = userEvent.setup();
    renderBar({ webhookId: null, endpointUrl: null });
    await user.click(screen.getByLabelText("Webhook actions"));
    const item = (await screen.findByRole("menuitem", { name: /Delete webhook/ })) as HTMLElement;
    expect(item.getAttribute("aria-disabled") ?? item.getAttribute("data-disabled") ?? item.getAttribute("disabled")).not.toBeNull();
  });
});