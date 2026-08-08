"use client";

import { base64Bytes } from "@/lib/inspector/body";
import { formatBytes, relativeTime } from "@/lib/inspector/format";
import { cn } from "@/lib/utils";
import { MethodBadge } from "@/components/inspector/method-badge";
import type { PolledRequest } from "@/components/inspector/use-requests";

export function RequestRow({
  request,
  selected,
  now,
  onSelect,
}: {
  request: PolledRequest;
  selected: boolean;
  now: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "hover:bg-accent focus-visible:ring-ring/50 w-full border-b px-3 py-[9px] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-inset",
        selected && "bg-accent shadow-[inset_2px_0_0_var(--primary)]",
        request.fresh && "wh-row-in",
      )}
    >
      <span className="flex items-center gap-2">
        <MethodBadge method={request.method} />
        <span className="truncate font-mono text-[12.5px]">
          {request.path}
          {request.query ? `?${request.query}` : ""}
        </span>
      </span>
      <span className="text-muted-foreground mt-[5px] flex items-center gap-1.5 pl-[62px] text-[11.5px]">
        <span>{relativeTime(request.createdAt, now)}</span>
        <span aria-hidden>·</span>
        <span>{formatBytes(base64Bytes(request.body))}</span>
        {request.truncated ? (
          <span className="bg-destructive/15 text-destructive rounded-sm px-1 text-[10px]">
            truncated
          </span>
        ) : null}
      </span>
    </button>
  );
}
