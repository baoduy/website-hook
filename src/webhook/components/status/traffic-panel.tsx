"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Traffic, TrafficWindow } from "@/lib/statistics";
import { formatBytes, formatNumber, bucketLabel } from "./formatting";

const WINDOWS: TrafficWindow[] = ["24h", "3d", "7d", "30d"];

const BUCKET_NAMES: Record<TrafficWindow, string> = {
  "24h": "one hour",
  "3d": "three hours",
  "7d": "six hours",
  "30d": "one day",
};

const RANGE_LABELS: Record<TrafficWindow, string> = {
  "24h": "last 24 hours",
  "3d": "last 3 days",
  "7d": "last 7 days",
  "30d": "last 30 days",
};

export function TrafficPanel({
  traffic,
  window,
  onWindowChange,
}: {
  traffic: Traffic | null;
  window: TrafficWindow;
  onWindowChange: (w: TrafficWindow) => void;
}) {
  const empty = !traffic || traffic.totalRequests === 0;

  const headline = traffic
    ? [
        { label: "Requests", value: formatNumber(traffic.totalRequests), sub: RANGE_LABELS[window] },
        { label: "Peak", value: formatNumber(traffic.busiestBucket), sub: "in a single bar" },
        { label: "Per day", value: formatNumber(traffic.averagePerDay), sub: "average rate" },
        {
          label: "Active webhooks",
          value: `${formatNumber(traffic.activeWebhooks)} / ${formatNumber(traffic.totalWebhooks)}`,
          sub: "hit in this window",
        },
        { label: "Payload", value: formatBytes(traffic.payloadBytes), sub: "received in window" },
      ]
    : [];

  return (
    <Card className="col-span-full overflow-hidden">
      <CardHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <CardTitle className="text-sm">Traffic across all webhooks</CardTitle>
            <p className="text-xs text-muted-foreground">
              {traffic ? `One bar = ${BUCKET_NAMES[window]} · ${RANGE_LABELS[window]}` : "Loading traffic…"}
            </p>
          </div>
          <div className="flex gap-0.5 rounded-md bg-muted p-1">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => onWindowChange(w)}
                className={cn(
                  "h-6 rounded-sm px-3 font-mono text-xs font-semibold transition-all",
                  window === w
                    ? "bg-card text-card-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <div className="grid grid-cols-5 border-b">
        {headline.map((h, i, a) => (
          <div
            key={h.label}
            className={cn("px-4 py-3", i < a.length - 1 && "border-r")}
          >
            <div className="text-xs text-muted-foreground">{h.label}</div>
            <div className="mt-0.5 text-xl font-semibold tracking-tight text-card-foreground">{h.value}</div>
            <div className="text-[11px] text-muted-foreground">{h.sub}</div>
          </div>
        ))}
      </div>

      <CardContent className="py-5">
        {empty ? (
          <div className="text-sm text-muted-foreground">No requests captured in this window.</div>
        ) : (
          <VolumeChart traffic={traffic} />
        )}
      </CardContent>
    </Card>
  );
}

function VolumeChart({ traffic }: { traffic: Traffic }) {
  const max = traffic.busiestBucket || 1;
  const step = Math.max(1, Math.ceil(traffic.buckets.length / 10));

  return (
    <div className="flex h-44 items-stretch gap-[3px]">
      {traffic.buckets.map((bucket, i) => {
        const pct = max > 0 ? Math.max(bucket.count ? 4 : 1, Math.round((bucket.count / max) * 100)) : 1;
        return (
          <div
            key={bucket.start}
            className="flex min-w-0 flex-1 flex-col gap-1.5"
            title={`${formatNumber(bucket.count)} ${bucket.count === 1 ? "request" : "requests"} · ${bucketLabel(bucket.start, traffic.window)}`}
          >
            <div className="flex flex-1 items-end">
              <div
                className={cn(
                  "w-full rounded-t-[2px]",
                  bucket.count ? "bg-primary" : "bg-muted-foreground/20",
                )}
                style={{ height: `${pct}%` }}
              />
            </div>
            <div className="h-3 text-center font-mono text-[9.5px] leading-3 text-muted-foreground whitespace-nowrap">
              {i % step === 0 ? bucketLabel(bucket.start, traffic.window) : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
