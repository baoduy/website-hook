import { isSensitiveHeader } from "@/lib/inspector/headers";
import { cn } from "@/lib/utils";

export type KeyValue = { key: string; value: string };

/**
 * Headers and query parameters share one table. Every key and value is rendered as text —
 * captured data is never interpreted, only shown.
 */
export function KvTable({
  keyLabel,
  rows,
  emptyMessage,
  highlightSensitive = false,
}: {
  keyLabel: string;
  rows: KeyValue[];
  emptyMessage?: string;
  highlightSensitive?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground px-1 text-[12.5px]">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <div
        className="bg-muted text-muted-foreground grid gap-4 px-[14px] py-2 text-[11.5px] font-medium"
        style={{ gridTemplateColumns: "260px 1fr" }}
      >
        <div>{keyLabel}</div>
        <div>Value</div>
      </div>
      {rows.map((row, index) => (
        <div
          key={`${row.key}-${index}`}
          className="hover:bg-accent grid gap-4 border-t px-[14px] py-2"
          style={{ gridTemplateColumns: "260px 1fr" }}
        >
          <div
            className={cn(
              "font-mono text-[11.5px] font-medium break-all",
              highlightSensitive && isSensitiveHeader(row.key)
                ? "text-primary"
                : "text-muted-foreground",
            )}
          >
            {row.key}
          </div>
          <div className="font-mono text-[11.5px] break-all">{row.value}</div>
        </div>
      ))}
    </div>
  );
}
