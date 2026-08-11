"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_REMEMBERED_WEBHOOKS } from "@/lib/constants";
import * as api from "@/lib/inspector/api";
import type { WebhookSummary } from "@/lib/inspector/api";
import { addId, readIds, removeId } from "@/lib/inspector/storage";

/** A remembered id plus whatever the server still knows about it. `gone` = the server 404s it. */
export type RememberedWebhook = {
  id: string;
  summary: WebhookSummary | null;
  gone: boolean;
};

export type CreateOutcome = "created" | "at_cap" | "rate_limited" | "failed";

export function useWebhooks() {
  const [webhooks, setWebhooks] = useState<RememberedWebhook[]>([]);
  const [preferredId, setPreferredId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  // Mirrors what is in localStorage so the cap check never depends on a stale render.
  const idsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const ids = readIds(window.localStorage);
      idsRef.current = ids;
      const entries = await Promise.all(ids.map(loadOne));
      if (cancelled) return;
      setWebhooks(entries);
      setLoading(false);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Same fallback shape as the request selection: a dropped preference lands on the first row
  // rather than on nothing.
  const selected = webhooks.find((entry) => entry.id === preferredId) ?? webhooks[0] ?? null;
  const atCap = webhooks.length >= MAX_REMEMBERED_WEBHOOKS;

  /** Guarded twice over: the cap, and an in-flight create — a double click cannot race past it. */
  const create = useCallback(async (): Promise<CreateOutcome> => {
    if (creating) return "failed";
    if (idsRef.current.length >= MAX_REMEMBERED_WEBHOOKS) return "at_cap";

    setCreating(true);
    try {
      const result = await api.createWebhook();
      if (!result.ok) return result.error === "rate_limited" ? "rate_limited" : "failed";

      const created = result.value;
      idsRef.current = addId(window.localStorage, idsRef.current, created.id);
      setWebhooks((current) => [
        {
          id: created.id,
          summary: {
            id: created.id,
            createdAt: created.createdAt,
            lastActivityAt: created.createdAt,
            requestCount: 0,
            expiresAt: created.expiresAt,
          },
          gone: false,
        },
        ...current,
      ]);
      setPreferredId(created.id);
      return "created";
    } finally {
      setCreating(false);
    }
  }, [creating]);

  /** Drops a webhook from the rail without touching the server — used for expired (404) ids. */
  const forget = useCallback((id: string) => {
    idsRef.current = removeId(window.localStorage, idsRef.current, id);
    setWebhooks((current) => current.filter((entry) => entry.id !== id));
    setPreferredId((current) => (current === id ? null : current));
  }, []);

  /** Deletes server-side and forgets it locally. */
  const remove = useCallback(
    async (id: string) => {
      await api.deleteWebhook(id);
      forget(id);
    },
    [forget],
  );

  /** Re-reads one webhook's counters — called after a poll finds new requests. */
  const refresh = useCallback(async (id: string) => {
    const entry = await loadOne(id);
    setWebhooks((current) => current.map((existing) => (existing.id === id ? entry : existing)));
  }, []);

  return {
    webhooks,
    selected,
    selectedId: selected?.id ?? null,
    loading,
    creating,
    atCap,
    select: setPreferredId,
    create,
    remove,
    forget,
    refresh,
  };
}

async function loadOne(id: string): Promise<RememberedWebhook> {
  const result = await api.getWebhook(id);
  if (result.ok) return { id, summary: result.value, gone: false };
  // Only a definite 404 marks it gone; a network blip leaves the row intact but unpopulated.
  return { id, summary: null, gone: result.error === "gone" };
}
