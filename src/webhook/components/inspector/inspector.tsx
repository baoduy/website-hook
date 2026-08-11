"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { GitBranch, Globe, Webhook } from "lucide-react";
import { Sidebar, SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { filterRequests, resolveSelection, type MethodFilter } from "@/lib/inspector/filter";
import { DeleteWebhookDialog } from "@/components/inspector/delete-webhook-dialog";
import { EndpointBar } from "@/components/inspector/endpoint-bar";
import { RequestDetail } from "@/components/inspector/request-detail";
import { RequestList } from "@/components/inspector/request-list";
import { StatPills } from "@/components/inspector/stat-pills";
import { WebhookList } from "@/components/inspector/webhook-list";
import { useRequests } from "@/components/inspector/use-requests";
import { useWebhooks } from "@/components/inspector/use-webhooks";

const SIDEBAR_WIDTH = "372px";
const AT_CAP_MESSAGE = "This browser remembers five webhooks at a time. Delete one to create another.";

const noopSubscribe = () => () => {};

export function Inspector() {
  // Everything here depends on localStorage and the browser's own origin, so the first paint is
  // deliberately a static frame — that also keeps the server HTML free of a guess to mismatch.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  if (!mounted) return <div className="h-svh" />;
  return <InspectorShell />;
}

/** Drives the 1s re-render that keeps relative times honest. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  return now;
}

function InspectorShell() {
  const now = useNow();
  const webhooks = useWebhooks();
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<MethodFilter>("ALL");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { forget, refresh: refreshWebhook } = webhooks;
  const onNewRequests = useCallback((id: string) => void refreshWebhook(id), [refreshWebhook]);
  const onGone = useCallback((id: string) => forget(id), [forget]);

  const requests = useRequests({ webhookId: webhooks.selectedId, onNewRequests, onGone });

  const baseUrl = window.location.origin;
  const endpointUrl = webhooks.selectedId ? `${baseUrl}/${webhooks.selectedId}` : null;

  const filtered = useMemo(
    () => filterRequests(requests.requests, search, method),
    [requests.requests, search, method],
  );
  const selectedRequest = resolveSelection(filtered, selectedRequestId);
  const filterActive = search.trim().length > 0 || method !== "ALL";

  async function createWebhook() {
    const outcome = await webhooks.create();
    if (outcome === "at_cap") setNotice(AT_CAP_MESSAGE);
    else if (outcome === "rate_limited")
      setNotice("Creation is rate limited to 20 per minute per IP. Try again shortly.");
    else if (outcome === "failed") setNotice("Could not reach the service. Try again.");
    else setNotice(null);
  }

  return (
    <TooltipProvider>
      <SidebarProvider style={{ "--sidebar-width": SIDEBAR_WIDTH } as React.CSSProperties}>
        <Sidebar collapsible="offcanvas">
          <div className="flex h-svh min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b p-2">
              <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
                <Webhook className="size-4" aria-hidden />
              </span>
              <span className="grid gap-px">
                <span className="text-[13.5px] font-semibold tracking-[-0.01em]">website·hook</span>
                <span className="text-muted-foreground text-[11.5px]">Capture inspector</span>
              </span>
            </div>

            <WebhookList
              webhooks={webhooks.webhooks}
              selectedId={webhooks.selectedId}
              atCap={webhooks.atCap}
              creating={webhooks.creating}
              onSelect={webhooks.select}
              onCreate={createWebhook}
              onForget={webhooks.forget}
            />

            <RequestList
              requests={filtered}
              totalCount={requests.requests.length}
              filterActive={filterActive}
              search={search}
              method={method}
              selectedId={selectedRequest?.id ?? null}
              now={now}
              nextCursor={requests.nextCursor}
              loadingOlder={requests.loadingOlder}
              hasWebhook={Boolean(webhooks.selectedId)}
              onSearchChange={setSearch}
              onMethodChange={setMethod}
              onSelect={setSelectedRequestId}
              onRefresh={requests.refresh}
              onLoadOlder={requests.loadOlder}
            />

            <div className="flex items-center gap-2 border-t px-3 py-2.5">
              <a
                href="https://github.com/baoduy/website-hook"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View source on GitHub"
                title="View source on GitHub"
                className="inline-flex size-[22px] items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground ml-auto"
              >
                <GitBranch className="size-[14px]" aria-hidden />
              </a>
              <a
                href="https://drunkcoding.net"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Visit drunkcoding.net"
                title="Visit drunkcoding.net"
                className="inline-flex size-[22px] items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                <Globe className="size-[14px]" aria-hidden />
              </a>
            </div>
          </div>
        </Sidebar>

        <SidebarInset className="h-svh min-h-0 overflow-hidden">
          <EndpointBar
            webhookId={webhooks.selectedId}
            endpointUrl={endpointUrl}
            atCap={webhooks.atCap}
            atCapMessage={AT_CAP_MESSAGE}
            creating={webhooks.creating}
            onCreate={createWebhook}
            onDelete={() => setConfirmingDelete(true)}
          />

          <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
            {webhooks.selected?.summary ? (
              <StatPills webhook={webhooks.selected.summary} now={now} />
            ) : null}

            {notice ? (
              <p role="status" className="text-destructive text-[12.5px]">
                {notice}
              </p>
            ) : null}

            <RequestDetail
              request={selectedRequest}
              webhookId={webhooks.selectedId}
              baseUrl={baseUrl}
              hasWebhook={Boolean(webhooks.selectedId)}
            />
          </div>
        </SidebarInset>

        <DeleteWebhookDialog
          open={confirmingDelete}
          endpointUrl={endpointUrl}
          onOpenChange={setConfirmingDelete}
          onConfirm={() => {
            const id = webhooks.selectedId;
            setConfirmingDelete(false);
            if (id) void webhooks.remove(id);
          }}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}
