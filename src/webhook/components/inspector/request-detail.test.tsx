// @vitest-environment happy-dom
import "@/test/component-setup";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequestDetail } from "./request-detail";
import type { CapturedRequest } from "@/lib/inspector/api";
import { decodeBodyText } from "@/lib/inspector/body";

const enc = (t: string) => Buffer.from(t, "utf-8").toString("base64");

const request = (overrides: Partial<CapturedRequest> = {}): CapturedRequest => ({
  id: "abcdefgh-1234",
  method: "POST",
  path: "/orders/9182",
  query: "a=1&b=two",
  headers: { "content-type": "application/json", "x-markup": "<script>alert(1)</script>" },
  body: enc('{"status":"shipped"}'),
  truncated: false,
  createdAt: 0,
  ...overrides,
});

let createObjectURL: ReturnType<typeof vi.fn>;
beforeEach(() => {
  createObjectURL = vi.fn().mockReturnValue("blob:stub") as unknown as ReturnType<typeof vi.fn>;
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});

describe("RequestDetail — empty states", () => {
  it("shows the no-webhook state with a bare cURL snippet when none is selected", () => {
    render(<RequestDetail request={null} webhookId={null} baseUrl="https://hook.example" hasWebhook={false} />);
    expect(screen.getByText("No webhook selected")).toBeTruthy();
    expect(screen.getByText(/curl -X POST 'https:\/\/hook.example\/api\/webhooks'/)).toBeTruthy();
  });

  it("shows the select-a-request state, reserving no webhook path", () => {
    render(<RequestDetail request={null} webhookId="wh-1" baseUrl="https://hook.example" hasWebhook={true} />);
    expect(screen.getByText("Select a request")).toBeTruthy();
    expect(screen.getByText(/\/wh-1\/orders\/9182/)).toBeTruthy();
  });
});

describe("RequestDetail — detail card", () => {
  it("renders method, path+query, id and timestamp", () => {
    render(<RequestDetail request={request()} webhookId="wh-1" baseUrl="https://hook.example" hasWebhook={true} />);
    expect(screen.getByText("POST")).toBeTruthy();
    expect(screen.getByText("/orders/9182?a=1&b=two")).toBeTruthy();
    expect(screen.getByText("abcdefgh-1234")).toBeTruthy();
  });

  it("renders the JSON body in the body tab", () => {
    render(<RequestDetail request={request()} webhookId="wh-1" baseUrl="https://hook.example" hasWebhook={true} />);
    expect(screen.getByText('"status"')).toBeTruthy();
    expect(screen.getByText('"shipped"')).toBeTruthy();
  });

  it("shows header count and lists headers in the headers tab, sensitive ones highlighted", async () => {
    const user = userEvent.setup();
    const { container } = render(<RequestDetail request={request()} webhookId="wh-1" baseUrl="https://hook.example" hasWebhook={true} />);
    await user.click(screen.getByRole("tab", { name: /Headers 2/ }));
    await screen.findByText("content-type");
    expect(screen.getByText("content-type")).toBeTruthy();
    expect(screen.getByText("application/json")).toBeTruthy();
    expect(screen.getByText("x-markup")).toBeTruthy();
    // captured markup renders as text, never as an element
    expect(container.querySelectorAll("script")).toHaveLength(0);
  });

  it("parses query params into the query tab", async () => {
    const user = userEvent.setup();
    render(<RequestDetail request={request()} webhookId="wh-1" baseUrl="https://hook.example" hasWebhook={true} />);
    await user.click(screen.getByRole("tab", { name: "Query" }));
    await screen.findByText("two");
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("b")).toBeTruthy();
    expect(screen.getByText("two")).toBeTruthy();
  });

  it("copies the cURL command to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<RequestDetail request={request()} webhookId="wh-1" baseUrl="https://hook.example" hasWebhook={true} />);
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Copy cURL" }));
    });
    expect(writeText).toHaveBeenCalled();
    const copied = writeText.mock.calls[0][0] as string;
    // The method is interpolated unquoted per the contract (carry-over from dev-leader).
    expect(copied.startsWith("curl -X POST ")).toBe(true);
    expect(copied).toContain("https://hook.example/wh-1/orders/9182?a=1&b=two");
    expect(copied).toContain("-H 'x-markup: <script>alert(1)</script>'");
    expect(copied).toContain("--data-raw '{\"status\":\"shipped\"}'");
  });

  it("falls back to a copy-unavailable message when clipboard is absent", () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    render(<RequestDetail request={request()} webhookId="wh-1" baseUrl="https://hook.example" hasWebhook={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy cURL" }));
    expect(screen.getByText(/Copy unavailable/)).toBeTruthy();
  });

  it("downloads the decoded body as body-<id8>.txt with safe, id-derived filename", async () => {
    const anchors: { download?: string; href?: string }[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") {
        const record: { download?: string; href?: string } = {};
        Object.defineProperty(el, "download", {
          get: () => record.download,
          set: (v: string) => {
            record.download = v;
            anchors.push({ download: v, href: el.getAttribute("href") ?? undefined });
          },
          configurable: true,
        });
        el.click = vi.fn() as unknown as typeof el.click;
      }
      return el;
    });

    render(<RequestDetail request={request({ id: "abcdefgh-1234" })} webhookId="wh-1" baseUrl="https://hook.example" hasWebhook={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Body" }));

    await Promise.resolve();
    expect(createObjectURL).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(await blob.text()).toBe(decodeBodyText(enc('{"status":"shipped"}')));
    expect(anchors[0]?.download).toBe("body-abcdefgh.txt");
    // No path separators: a crafted-looking id must not smuggle one through slice.
    expect(anchors[0]?.download).not.toMatch(/[\\/]/);
  });
});