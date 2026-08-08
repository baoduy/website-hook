import { cn } from "@/lib/utils";

// GET/HEAD read, DELETE destroys, everything else writes — the palette follows that split.
function toneFor(method: string): string {
  if (method === "GET" || method === "HEAD") return "border-border text-muted-foreground";
  if (method === "DELETE") return "border-destructive/35 bg-destructive/12 text-destructive";
  return "border-primary bg-primary text-primary-foreground";
}

export function MethodBadge({
  method,
  size = "row",
  className,
}: {
  method: string;
  size?: "row" | "detail";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm border font-mono font-semibold uppercase",
        size === "row" ? "w-[54px] py-[1px] text-[10px]" : "px-2 py-[2px] text-[11px]",
        toneFor(method),
        className,
      )}
    >
      {method}
    </span>
  );
}
