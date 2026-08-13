"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TrafficMethod } from "@/lib/statistics";
import { formatNumber } from "./formatting";

function badgeClasses(method: string): string {
  if (method === "GET" || method === "HEAD") {
    return "border-border text-muted-foreground";
  }
  if (method === "DELETE") {
    return "border-destructive/35 bg-destructive/12 text-destructive";
  }
  return "border-primary bg-primary text-primary-foreground";
}

export function MethodBreakdown({ methods, empty }: { methods: TrafficMethod[]; empty: boolean }) {
  return (
    <Card>
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-sm">Methods</CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-1">
        {empty ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">No requests captured in this window.</div>
        ) : (
          methods.map((m) => (
            <div key={m.method} className="flex items-center gap-3 px-4 py-2">
              <span
                className={cn(
                  "inline-flex w-[54px] shrink-0 items-center justify-center rounded-sm border py-[1px] font-mono text-[10px] font-semibold uppercase",
                  badgeClasses(m.method),
                )}
              >
                {m.method === "DELETE" ? "DEL" : m.method}
              </span>
              <div className="flex-1 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${Math.min(100, m.percentage)}%` }}
                />
              </div>
              <span className="w-[42px] shrink-0 text-right font-mono text-xs font-semibold">
                {formatNumber(m.count)}
              </span>
              <span className="w-[34px] shrink-0 text-right text-xs text-muted-foreground">{m.percentage}%</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
