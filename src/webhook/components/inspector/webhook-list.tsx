"use client";

import { Plus, SquareCode, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortId } from "@/lib/inspector/format";
import { cn } from "@/lib/utils";
import type { RememberedWebhook } from "@/components/inspector/use-webhooks";

const AT_CAP_MESSAGE = "This browser remembers five webhooks at a time. Delete one to create another.";

export function WebhookList({
  webhooks,
  selectedId,
  atCap,
  creating,
  onSelect,
  onCreate,
  onForget,
}: {
  webhooks: RememberedWebhook[];
  selectedId: string | null;
  atCap: boolean;
  creating: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onForget: (id: string) => void;
}) {
  return (
    <div className="flex-none p-2">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-muted-foreground text-[11.5px] font-medium">Webhooks</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-[22px]"
          onClick={onCreate}
          disabled={atCap || creating}
          aria-label="New webhook"
          aria-describedby={atCap ? "webhook-cap-hint" : undefined}
          title={atCap ? AT_CAP_MESSAGE : "New webhook"}
        >
          <Plus className="size-[14px]" />
        </Button>
      </div>

      {webhooks.length === 0 ? (
        <p className="text-muted-foreground p-2 text-[12.5px]">
          Nothing remembered in this browser yet.
        </p>
      ) : (
        <ul className="grid max-h-[196px] gap-0.5 overflow-y-auto">
          {webhooks.map((webhook) => (
            <li key={webhook.id}>
              <WebhookRow
                webhook={webhook}
                selected={webhook.id === selectedId}
                onSelect={() => onSelect(webhook.id)}
                onForget={() => onForget(webhook.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {atCap ? (
        <p id="webhook-cap-hint" className="text-muted-foreground px-2 pt-2 text-[11.5px]">
          {AT_CAP_MESSAGE}
        </p>
      ) : null}
    </div>
  );
}

function WebhookRow({
  webhook,
  selected,
  onSelect,
  onForget,
}: {
  webhook: RememberedWebhook;
  selected: boolean;
  onSelect: () => void;
  onForget: () => void;
}) {
  // An expired or deleted webhook stays visible but inert — the user drops it deliberately
  // rather than the rail silently rewriting itself.
  if (webhook.gone) {
    return (
      <div className="flex items-center gap-2 rounded-md px-2 py-[7px]">
        <TriangleAlert className="text-destructive size-[15px] shrink-0" aria-hidden />
        <span className="text-muted-foreground truncate font-mono text-[12px] line-through">
          {shortId(webhook.id)}
        </span>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto text-[11px]"
          onClick={onForget}
          aria-label={`Remove expired webhook ${webhook.id}`}
        >
          Expired — remove
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "hover:bg-sidebar-accent focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-md px-2 py-[7px] outline-none focus-visible:ring-[3px]",
        selected && "bg-sidebar-accent text-accent-foreground font-medium",
      )}
    >
      <SquareCode className="size-[15px] shrink-0 opacity-75" aria-hidden />
      <span className="truncate font-mono text-[12px]">{shortId(webhook.id)}</span>
      <span
        className={cn(
          "ml-auto rounded-full px-1.5 py-px text-[11px] font-medium",
          selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {webhook.summary?.requestCount ?? 0}
      </span>
    </button>
  );
}
