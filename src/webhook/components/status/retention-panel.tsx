"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CleanupPreview, Storage } from "@/lib/statistics";
import { formatBytes, formatNumber } from "./formatting";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function RetentionPanel({
  storage,
  preview,
  onCleanup,
}: {
  storage: Storage | null;
  preview: CleanupPreview | null;
  onCleanup: () => void;
}) {
  const targets = preview?.webhooks ?? [];
  const totalRequests = preview?.totalRequests ?? 0;
  const disabled = targets.length === 0;

  const rows = storage
    ? [
        { k: "Stored webhooks", v: formatNumber(storage.webhooks) },
        { k: "Stored requests", v: formatNumber(storage.capturedRequests) },
        {
          k: "Created over 30 days ago",
          v: formatNumber(storage.oldWebhooks),
          destructive: storage.oldWebhooks > 0,
        },
        {
          k: "Requests in those",
          v: `${formatNumber(storage.oldRequests)} · ${formatBytes(storage.oldBytes)}`,
        },
      ]
    : [];

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-sm">Retention</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 px-0 py-0">
        {rows.map((r, i, a) => (
          <div
            key={r.k}
            className={cn("flex items-center justify-between gap-3 px-4 py-2", i < a.length - 1 && "border-b")}
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
      <CardFooter className="grid gap-2 px-4 py-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 gap-1.5 text-xs",
                disabled
                  ? "pointer-events-none border-border text-muted-foreground opacity-60"
                  : "border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive hover:text-white",
              )}
              disabled={disabled}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {disabled
                ? "Nothing older than 30 days"
                : `Delete ${targets.length} ${targets.length === 1 ? "webhook" : "webhooks"} + ${formatNumber(totalRequests)} requests`}
            </Button>
          </AlertDialogTrigger>
          {!disabled && (
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete everything older than 30 days?</AlertDialogTitle>
                <AlertDialogDescription>
                  Webhooks created more than 30 days ago are removed along with every request captured on them. Their
                  endpoints answer 404 from then on. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="max-h-48 overflow-auto rounded-md border">
                {targets.map((t, i) => (
                  <div
                    key={t.id}
                    className={cn(
                      "flex items-center justify-between gap-3 px-3 py-2",
                      i < targets.length - 1 && "border-b",
                    )}
                  >
                    <span className="min-w-0 truncate font-mono text-xs">{t.id}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatNumber(t.requestCount)} requests
                    </span>
                  </div>
                ))}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={onCleanup}
                >
                  Delete {targets.length} {targets.length === 1 ? "webhook" : "webhooks"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          )}
        </AlertDialog>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Idle webhooks already self-purge after 7 days. This clears anything created over 30 days ago, however recently
          it was hit.
        </p>
      </CardFooter>
    </Card>
  );
}
