"use client";

import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WebhookListItem, RecentRequests } from "@/lib/statistics";
import { formatBytes, formatNumber, relativeTime, untilTime } from "./formatting";
import { useState, useCallback } from "react";
import type { ApiResult } from "@/lib/statistics/api";

const CLEANUP_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function badgeClasses(method: string): string {
  if (method === "GET" || method === "HEAD") {
    return "border-border text-muted-foreground";
  }
  if (method === "DELETE") {
    return "border-destructive/35 bg-destructive/12 text-destructive";
  }
  return "border-primary bg-primary text-primary-foreground";
}

export function WebhookTable({
  webhooks,
  search,
  onSearchChange,
  totalRequests,
  now,
  fetchRequests,
}: {
  webhooks: WebhookListItem[];
  search: string;
  onSearchChange: (value: string) => void;
  totalRequests: number;
  now: number;
  fetchRequests: (id: string) => Promise<ApiResult<RecentRequests>>;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [requests, setRequests] = useState<Record<string, RecentRequests | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const toggle = useCallback(
    async (id: string) => {
      const next = { ...expanded, [id]: !expanded[id] };
      setExpanded(next);
      if (next[id] && !requests[id] && !loading[id]) {
        setLoading((prev) => ({ ...prev, [id]: true }));
        const result = await fetchRequests(id);
        if (result.ok) {
          setRequests((prev) => ({ ...prev, [id]: result.value }));
        }
        setLoading((prev) => ({ ...prev, [id]: false }));
      }
    },
    [expanded, requests, loading, fetchRequests],
  );

  const empty = webhooks.length === 0;
  const emptyText = search ? "No webhook matches that filter." : "No webhooks stored.";

  return (
    <Card className="col-span-full overflow-hidden">
      <CardHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-semibold">Webhooks</div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(webhooks.length)} stored · {formatNumber(totalRequests)} requests · expand a row to see its
              requests
            </p>
          </div>
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter by id or path…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-8 w-64 pl-8 text-xs"
            />
          </div>
        </div>
      </CardHeader>

      <div className="grid grid-cols-[24px_1fr_96px_96px_84px_92px_96px] gap-3 border-b bg-muted px-4 py-2 text-[11px] font-medium text-muted-foreground">
        <span />
        <span>Webhook</span>
        <span className="text-right">Created</span>
        <span className="text-right">Last hit</span>
        <span className="text-right">Requests</span>
        <span className="text-right">Payload</span>
        <span className="text-right">Expires</span>
      </div>

      <CardContent className="px-0 py-0">
        {empty ? (
          <div className="px-4 py-7 text-center text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          webhooks.map((w) => (
            <WebhookRow
              key={w.id}
              webhook={w}
              now={now}
              open={!!expanded[w.id]}
              loading={!!loading[w.id]}
              recent={requests[w.id]}
              onToggle={() => toggle(w.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function WebhookRow({
  webhook,
  now,
  open,
  loading,
  recent,
  onToggle,
}: {
  webhook: WebhookListItem;
  now: number;
  open: boolean;
  loading: boolean;
  recent: RecentRequests | null;
  onToggle: () => void;
}) {
  const stale = webhook.createdAt < now - CLEANUP_AGE_MS;
  const shown = recent?.items ?? [];
  const hasMore = (recent?.total ?? 0) > shown.length;

  return (
    <div className="border-b last:border-b-0">
      <div
        onClick={onToggle}
        className={cn(
          "grid cursor-pointer grid-cols-[24px_1fr_96px_96px_84px_92px_96px] items-center gap-3 px-4 py-2.5 hover:bg-accent",
          open && "bg-accent",
        )}
      >
        <span className="flex items-center justify-center text-muted-foreground">
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-mono text-xs text-card-foreground">{webhook.id}</span>
          {stale && (
            <span className="shrink-0 rounded-full bg-destructive/14 px-1.5 py-0 text-[10px] font-medium text-destructive">
              30d+
            </span>
          )}
        </span>
        <span className={cn("text-right text-xs", stale ? "text-destructive" : "text-muted-foreground")}>
          {relativeTime(now, webhook.createdAt)}
        </span>
        <span className="text-right text-xs text-muted-foreground">
          {webhook.requestCount > 0 ? relativeTime(now, webhook.lastActivityAt) : "never"}
        </span>
        <span className="text-right font-mono text-xs font-semibold">{formatNumber(webhook.requestCount)}</span>
        <span className="text-right font-mono text-xs text-muted-foreground">{formatBytes(webhook.payloadBytes)}</span>
        <span
          className={cn(
            "text-right text-xs",
            webhook.expiresAt - now < 36 * 60 * 60 * 1000 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {untilTime(now, webhook.expiresAt)}
        </span>
      </div>

      {open && (
        <div className="bg-muted/55 px-4 py-2.5 pl-12">
          {loading ? (
            <div className="text-xs text-muted-foreground">Loading requests…</div>
          ) : shown.length === 0 ? (
            <div className="text-xs text-muted-foreground">No requests captured on this webhook yet.</div>
          ) : (
            <>
              {shown.map((r) => (
                <div key={r.id} className="grid grid-cols-[54px_1fr_96px_80px] items-center gap-3 py-1">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded-sm border py-[1px] font-mono text-[10px] font-semibold uppercase",
                      badgeClasses(r.method),
                    )}
                  >
                    {r.method === "DELETE" ? "DEL" : r.method}
                  </span>
                  <span className="min-w-0 truncate font-mono text-xs text-card-foreground">{r.path}</span>
                  <span className="text-right text-xs text-muted-foreground">{relativeTime(now, r.createdAt)}</span>
                  <span className="text-right font-mono text-xs text-muted-foreground">{formatBytes(r.bodySize)}</span>
                </div>
              ))}
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                {hasMore && <span>Showing {shown.length} of {formatNumber(recent?.total ?? 0)} captured requests.</span>}
                <Link href="/" className="font-medium text-primary hover:underline">
                  Open in inspector
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
