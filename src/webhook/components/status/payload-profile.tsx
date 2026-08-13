"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Traffic } from "@/lib/statistics";
import { formatBytes, formatNumber } from "./formatting";

export function PayloadProfile({ traffic }: { traffic: Traffic | null }) {
  const rows = traffic
    ? [
        { k: "Total received", v: formatBytes(traffic.payloadBytes) },
        { k: "Average body", v: formatBytes(traffic.averageBodyBytes) },
        { k: "Largest body", v: formatBytes(traffic.largestBodyBytes) },
        {
          k: "Empty bodies",
          v: `${formatNumber(traffic.emptyBodies)} of ${formatNumber(traffic.totalRequests)}`,
        },
        {
          k: "Truncated at 1 MB",
          v: formatNumber(traffic.truncatedBodies),
          destructive: traffic.truncatedBodies > 0,
        },
      ]
    : [];

  return (
    <Card>
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-sm">Payloads</CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {rows.map((r, i, a) => (
          <div
            key={r.k}
            className={cn(
              "flex items-center justify-between gap-3 px-4 py-2",
              i < a.length - 1 && "border-b",
            )}
          >
            <span className="text-xs text-muted-foreground">{r.k}</span>
            <span
              className={cn(
                "font-mono text-xs font-medium",
                "destructive" in r && r.destructive ? "text-destructive" : "text-card-foreground",
              )}
            >
              {r.v}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
