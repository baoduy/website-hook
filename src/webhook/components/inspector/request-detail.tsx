"use client";

import { useEffect, useRef, useState } from "react";
import { Download, SquareChevronRight, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CapturedRequest } from "@/lib/inspector/api";
import { decodeBodyText } from "@/lib/inspector/body";
import { buildCurl } from "@/lib/inspector/curl";
import { formatStamp } from "@/lib/inspector/format";
import { BodyViewer } from "@/components/inspector/body-viewer";
import { KvTable, type KeyValue } from "@/components/inspector/kv-table";
import { MethodBadge } from "@/components/inspector/method-badge";

const COPIED_MS = 1400;

export function RequestDetail({
  request,
  webhookId,
  baseUrl,
  hasWebhook,
}: {
  request: CapturedRequest | null;
  webhookId: string | null;
  baseUrl: string;
  hasWebhook: boolean;
}) {
  if (!hasWebhook) {
    return (
      <EmptyCard
        title="No webhook selected"
        body="Create a webhook to get started. Webhooks purge themselves after seven idle days; creation is limited to 20 per minute per IP."
        snippet={`curl -X POST '${baseUrl}/api/webhooks'`}
      />
    );
  }

  if (!request || !webhookId) {
    return (
      <EmptyCard
        title="Select a request"
        body="Requests arrive newest-first. Bodies are stored as opaque bytes and returned base64-encoded, so anything non-JSON falls back to a raw pane."
        snippet={[
          `curl -X POST '${baseUrl}/${webhookId ?? "<id>"}/orders/9182' \\`,
          `  -H 'content-type: application/json' \\`,
          `  --data-raw '{"status":"shipped"}'`,
        ].join("\n")}
      />
    );
  }

  return <DetailCard request={request} webhookId={webhookId} baseUrl={baseUrl} />;
}

function DetailCard({
  request,
  webhookId,
  baseUrl,
}: {
  request: CapturedRequest;
  webhookId: string;
  baseUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const headerRows: KeyValue[] = Object.entries(request.headers).map(([key, value]) => ({
    key,
    value,
  }));
  const queryRows: KeyValue[] = [...new URLSearchParams(request.query || "")].map(
    ([key, value]) => ({ key, value }),
  );

  async function copyCurl() {
    const text = buildCurl(request, baseUrl, webhookId);
    if (!navigator.clipboard) {
      setCopyFailed(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setCopyFailed(true);
      return;
    }
    setCopyFailed(false);
    setCopied(true);
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  function downloadBody() {
    const url = URL.createObjectURL(
      new Blob([decodeBodyText(request.body)], { type: "text/plain" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `body-${request.id.slice(0, 8)}.txt`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <Card className="flex min-h-0 min-w-[320px] flex-1 gap-0 overflow-hidden rounded-lg py-0 shadow-sm">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <MethodBadge method={request.method} size="detail" />
          <span className="truncate font-mono text-[13.5px] font-medium">
            {request.path}
            {request.query ? `?${request.query}` : ""}
          </span>
          <span className="text-muted-foreground ml-auto shrink-0 text-[11.5px]">
            {formatStamp(request.createdAt)}
          </span>
        </div>
        <p className="text-muted-foreground mt-1.5 font-mono text-[11px] break-all">{request.id}</p>
      </div>

      <Tabs defaultValue="body" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5">
          <TabsList className="h-auto p-[3px]">
            <TabsTrigger value="body" className="h-[26px] px-[11px] text-[12.5px] font-medium">
              Body
            </TabsTrigger>
            <TabsTrigger value="headers" className="h-[26px] px-[11px] text-[12.5px] font-medium">
              Headers {headerRows.length}
            </TabsTrigger>
            <TabsTrigger value="query" className="h-[26px] px-[11px] text-[12.5px] font-medium">
              Query
            </TabsTrigger>
          </TabsList>

          {/* Its own flex container so the actions wrap as one unit instead of splitting. */}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-[30px]" onClick={copyCurl}>
              <SquareChevronRight className="size-[13px]" />
              {copied ? "Copied" : "Copy cURL"}
            </Button>
            <Button variant="ghost" size="sm" className="h-[30px]" onClick={downloadBody}>
              <Download className="size-[13px]" />
              Body
            </Button>
          </div>

          {copyFailed ? (
            <span role="status" className="text-destructive text-[11.5px]">
              Copy unavailable — select the text manually.
            </span>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="body">
            <BodyViewer body={request.body} truncated={request.truncated} />
          </TabsContent>
          <TabsContent value="headers">
            <KvTable keyLabel="Header" rows={headerRows} highlightSensitive emptyMessage="No headers on this request." />
          </TabsContent>
          <TabsContent value="query">
            <KvTable
              keyLabel="Parameter"
              rows={queryRows}
              emptyMessage="No query string on this request."
            />
          </TabsContent>
        </div>
      </Tabs>
    </Card>
  );
}

function EmptyCard({ title, body, snippet }: { title: string; body: string; snippet: string }) {
  return (
    <Card className="flex min-h-0 min-w-[320px] flex-1 items-center justify-center overflow-hidden rounded-lg p-4 shadow-sm">
      <div className="max-w-[520px]">
        <div className="mb-3 flex size-10 items-center justify-center rounded-md border">
          <TerminalSquare className="size-[18px]" aria-hidden />
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-1 text-[13px]">{body}</p>
        <pre className="bg-muted mt-4 overflow-x-auto rounded-md p-3 font-mono text-[11.5px] leading-[1.7]">
          {snippet}
        </pre>
      </div>
    </Card>
  );
}
