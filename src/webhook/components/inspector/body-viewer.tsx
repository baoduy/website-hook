import { decodeBody } from "@/lib/inspector/body";
import { formatBytes } from "@/lib/inspector/format";

// Splits one pretty-printed JSON line into indent / key / separator / value so each part can be
// coloured. Emits data, never markup — the values are captured bytes and stay inert React text.
const LINE = /^(\s*)(?:("(?:[^"\\]|\\.)*")(:\s?))?([\s\S]*)$/;

export type JsonLine = {
  number: number;
  indent: string;
  key: string;
  separator: string;
  value: string;
  valueClass: string;
};

function classForValue(value: string): string {
  if (/^"/.test(value)) return "text-code-str";
  if (/^-?\d/.test(value)) return "text-code-num";
  if (/^(true|false|null)/.test(value)) return "text-muted-foreground";
  if (/^[[{\]}]/.test(value)) return "text-muted-foreground";
  return "text-card-foreground";
}

export function tokenizeJson(pretty: string): JsonLine[] {
  return pretty.split("\n").map((line, index) => {
    const match = LINE.exec(line);
    const value = match?.[4] ?? line;
    return {
      number: index + 1,
      indent: match?.[1] ?? "",
      key: match?.[2] ?? "",
      separator: match?.[3] ?? "",
      value,
      valueClass: classForValue(value),
    };
  });
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="bg-muted rounded-md border px-[14px] py-3">{children}</div>;
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground mb-2 text-[11.5px] font-medium">{children}</p>;
}

export function BodyViewer({ body, truncated }: { body: string; truncated: boolean }) {
  const decoded = decodeBody(body);

  return (
    <div>
      {decoded.kind === "json" ? (
        <Panel>
          <pre className="font-mono text-[12px] leading-[1.7]">
            <code>
              {tokenizeJson(decoded.pretty).map((line) => (
                <div key={line.number} className="flex gap-[14px]">
                  <span className="text-muted-foreground/60 w-5 shrink-0 text-right select-none">
                    {line.number}
                  </span>
                  <span className="min-w-0 break-all whitespace-pre-wrap">
                    {line.indent}
                    {line.key ? <span className="text-code-key font-medium">{line.key}</span> : null}
                    {line.separator ? (
                      <span className="text-muted-foreground">{line.separator}</span>
                    ) : null}
                    <span className={line.valueClass}>{line.value}</span>
                  </span>
                </div>
              ))}
            </code>
          </pre>
        </Panel>
      ) : (
        <>
          <Kicker>{decoded.kind === "empty" ? "Body" : "Body — not JSON, shown raw"}</Kicker>
          <Panel>
            <pre className="font-mono text-[12px] leading-[1.7] break-all whitespace-pre-wrap">
              {renderRaw(decoded)}
            </pre>
          </Panel>
        </>
      )}

      {truncated ? (
        <p className="text-destructive mt-2 text-[11.5px]">
          Body exceeded the capture limit and was stored truncated.
        </p>
      ) : null}
    </div>
  );
}

function renderRaw(decoded: ReturnType<typeof decodeBody>): string {
  if (decoded.kind === "empty") return "(empty body)";
  if (decoded.kind === "binary") return `(binary body — ${formatBytes(decoded.byteLength)})`;
  return decoded.kind === "text" ? decoded.text : "";
}
