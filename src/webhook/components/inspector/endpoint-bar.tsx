"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

const COPIED_MS = 1400;

export function EndpointBar({
  webhookId,
  endpointUrl,
  atCap,
  atCapMessage,
  creating,
  onCreate,
  onDelete,
}: {
  webhookId: string | null;
  endpointUrl: string | null;
  atCap: boolean;
  atCapMessage: string;
  creating: boolean;
  onCreate: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  async function copyUrl() {
    if (!endpointUrl) return;
    // Clipboard access is absent on insecure origins and in some embedded browsers — say so
    // rather than flashing a success the user did not get.
    if (!navigator.clipboard) {
      setCopyFailed(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(endpointUrl);
    } catch {
      setCopyFailed(true);
      return;
    }
    setCopyFailed(false);
    setCopied(true);
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <header className="flex h-14 items-center gap-3 border-b px-4">
      <SidebarTrigger className="size-8 shadow-xs" />
      <Separator orientation="vertical" className="h-6" />

      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="text-muted-foreground shrink-0 text-[12px]">Endpoint</span>
        <span
          className="truncate font-mono text-[13px] font-medium"
          title={endpointUrl ?? undefined}
        >
          {webhookId ? `/${webhookId}` : "—"}
        </span>
      </div>

      <div className="flex items-center">
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-r-none"
          onClick={copyUrl}
          disabled={!endpointUrl}
        >
          <Copy className="size-[14px]" />
          {copied ? "Copied" : "Copy URL"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="data-[state=open]:bg-accent -ml-px h-8 w-7 rounded-l-none px-0"
              aria-label="Webhook actions"
            >
              <ChevronDown className="size-[13px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuItem
              onSelect={onCreate}
              disabled={atCap || creating}
              title={atCap ? atCapMessage : undefined}
            >
              <Plus className="opacity-85" />
              New webhook
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete} disabled={!webhookId}>
              <Trash2 className="opacity-85" />
              Delete webhook
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {copyFailed ? (
        <span role="status" className="text-destructive text-[11.5px]">
          Copy unavailable — select the URL manually.
        </span>
      ) : null}

      <Separator orientation="vertical" className="h-6" />
      <ThemeToggle />
    </header>
  );
}
