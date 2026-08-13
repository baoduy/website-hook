"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusHeader } from "./header";
import { TrafficPanel } from "./traffic-panel";
import { MethodBreakdown } from "./method-breakdown";
import { PayloadProfile } from "./payload-profile";
import { RetentionPanel } from "./retention-panel";
import { WebhookTable } from "./webhook-table";
import { relativeTime } from "./formatting";
import type { TrafficWindow, Traffic, Storage, WebhookList, CleanupPreview, RecentRequests } from "@/lib/statistics";
import {
  getTraffic,
  getStorage,
  listWebhooks,
  previewCleanup,
  runCleanup,
  listWebhookRequests,
} from "@/lib/statistics/api";
import type { ApiResult } from "@/lib/statistics/api";

export function StatusDashboard() {
  const [now, setNow] = useState(() => Date.now());
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [window, setWindow] = useState<TrafficWindow>("24h");
  const [search, setSearch] = useState("");

  const [traffic, setTraffic] = useState<Traffic | null>(null);
  const [storage, setStorage] = useState<Storage | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookList | null>(null);
  const [cleanup, setCleanup] = useState<CleanupPreview | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getTraffic(window), getStorage(), listWebhooks(search), previewCleanup()]).then(
      ([t, s, w, c]) => {
        if (cancelled) return;
        if (t.ok) setTraffic(t.value);
        if (s.ok) setStorage(s.value);
        if (w.ok) setWebhooks(w.value);
        if (c.ok) setCleanup(c.value);
        setLoadedAt(Date.now());
      },
    );

    return () => {
      cancelled = true;
    };
  }, [window, search]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const handleCleanup = async () => {
    const result = await runCleanup();
    if (!result.ok) return;

    const [t, s, w, c] = await Promise.all([
      getTraffic(window),
      getStorage(),
      listWebhooks(search),
      previewCleanup(),
    ]);
    if (t.ok) setTraffic(t.value);
    if (s.ok) setStorage(s.value);
    if (w.ok) setWebhooks(w.value);
    if (c.ok) setCleanup(c.value);
    setLoadedAt(Date.now());
  };

  const fetchRequests = useCallback(async (id: string): Promise<ApiResult<RecentRequests>> => {
    return listWebhookRequests(id, 5);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground text-sm">
      <StatusHeader updatedAgo={`updated ${relativeTime(now, loadedAt)}`} />
      <main className="flex-1 grid grid-cols-3 gap-4 content-start p-5">
        <TrafficPanel traffic={traffic} window={window} onWindowChange={setWindow} />
        <MethodBreakdown methods={traffic?.methods ?? []} empty={!traffic || traffic.totalRequests === 0} />
        <PayloadProfile traffic={traffic} />
        <RetentionPanel storage={storage} preview={cleanup} onCleanup={handleCleanup} />
        <WebhookTable
          webhooks={webhooks?.items ?? []}
          search={search}
          onSearchChange={setSearch}
          totalRequests={storage?.capturedRequests ?? 0}
          now={now}
          fetchRequests={fetchRequests}
        />
      </main>
    </div>
  );
}
