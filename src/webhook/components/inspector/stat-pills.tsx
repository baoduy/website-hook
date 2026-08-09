import { MAX_REQUESTS_PER_WEBHOOK, TTL_DAYS } from "@/lib/constants";
import type { WebhookSummary } from "@/lib/inspector/api";
import { formatStamp, isExpiringSoon, relativeTime, timeUntil } from "@/lib/inspector/format";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function Pill({
  label,
  value,
  tooltip,
  warn = false,
}: {
  label: string;
  value: string;
  tooltip: string;
  warn?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-[11.5px]",
            "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
            warn && "border-destructive/35 bg-destructive/10 text-destructive",
          )}
        >
          <span className={cn(warn ? "text-destructive" : "text-muted-foreground")}>{label}</span>
          <span className="font-semibold">{value}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function StatPills({ webhook, now }: { webhook: WebhookSummary; now: number }) {
  const expiring = isExpiringSoon(webhook.expiresAt, now);

  return (
    <div className="flex flex-wrap gap-1.5">
      <Pill
        label="Created"
        value={relativeTime(webhook.createdAt, now)}
        tooltip={`Webhook created ${formatStamp(webhook.createdAt)}`}
      />
      <Pill
        label="Last hit"
        value={relativeTime(webhook.lastActivityAt, now)}
        tooltip={`Most recent request ${formatStamp(webhook.lastActivityAt)}`}
      />
      <Pill
        label="Captured"
        value={String(webhook.requestCount)}
        tooltip={`Requests held for this webhook (oldest pruned past ${MAX_REQUESTS_PER_WEBHOOK.toLocaleString()})`}
      />
      <Pill
        label="Expires"
        value={timeUntil(webhook.expiresAt, now)}
        tooltip={`Purged after ${TTL_DAYS} idle days — any request resets the clock`}
        warn={expiring}
      />
    </div>
  );
}
