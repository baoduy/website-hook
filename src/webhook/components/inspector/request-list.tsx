"use client";

import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { METHOD_FILTERS, type MethodFilter } from "@/lib/inspector/filter";
import { cn } from "@/lib/utils";
import { RequestRow } from "@/components/inspector/request-row";
import type { PolledRequest } from "@/components/inspector/use-requests";

export function RequestList({
  requests,
  totalCount,
  filterActive,
  search,
  method,
  selectedId,
  now,
  nextCursor,
  loadingOlder,
  hasWebhook,
  onSearchChange,
  onMethodChange,
  onSelect,
  onRefresh,
  onLoadOlder,
}: {
  requests: PolledRequest[];
  totalCount: number;
  filterActive: boolean;
  search: string;
  method: MethodFilter;
  selectedId: string | null;
  now: number;
  nextCursor: string | null;
  loadingOlder: boolean;
  hasWebhook: boolean;
  onSearchChange: (value: string) => void;
  onMethodChange: (value: MethodFilter) => void;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onLoadOlder: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t">
      <div className="grid gap-2 border-b p-3">
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-[10px] size-[14px] -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search path, header or body…"
            aria-label="Search path, header or body"
            className="h-8 pl-[30px] text-[12.5px]"
          />
        </div>

        <div
          role="group"
          aria-label="Filter by method"
          className="bg-muted flex gap-[3px] rounded-md p-[3px]"
        >
          {METHOD_FILTERS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => onMethodChange(label)}
              aria-pressed={method === label}
              className={cn(
                "focus-visible:ring-ring/50 h-6 flex-1 rounded-sm font-mono text-[10.5px] font-semibold outline-none focus-visible:ring-[3px]",
                method === label
                  ? "bg-card text-card-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-muted-foreground text-[11.5px] font-medium" aria-live="polite">
          {filterActive ? `${requests.length} requests matched` : `${totalCount} requests`}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6"
          onClick={onRefresh}
          disabled={!hasWebhook}
          aria-label="Refresh requests"
          title="Refresh requests"
        >
          <RefreshCw className="size-[13px]" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {requests.length === 0 ? (
          <EmptyState filterActive={filterActive} totalCount={totalCount} />
        ) : (
          requests.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              selected={request.id === selectedId}
              now={now}
              onSelect={() => onSelect(request.id)}
            />
          ))
        )}
      </div>

      {nextCursor ? (
        <button
          type="button"
          onClick={onLoadOlder}
          disabled={loadingOlder}
          className="hover:bg-accent focus-visible:ring-ring/50 h-9 w-full border-t text-[12.5px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-inset disabled:opacity-50"
        >
          Load older
        </button>
      ) : null}
    </div>
  );
}

function EmptyState({ filterActive, totalCount }: { filterActive: boolean; totalCount: number }) {
  const title = filterActive ? "Nothing matches" : "Waiting for requests";
  const body = filterActive
    ? `Clear the search or method filter to see all ${totalCount} captured requests.`
    : "Point any system at the endpoint above. Every method and sub-path is captured and answered with 200.";

  return (
    <div className="px-4 py-7 text-center">
      <p className="text-[13.5px] font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-[12.5px]">{body}</p>
    </div>
  );
}
