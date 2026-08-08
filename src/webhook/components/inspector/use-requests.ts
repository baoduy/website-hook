"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POLL_INTERVAL_MS } from "@/lib/constants";
import * as api from "@/lib/inspector/api";
import type { CapturedRequest } from "@/lib/inspector/api";

const PAGE_SIZE = 20;

/** `fresh` marks a row that arrived from a poll, so it can flash in once. */
export type PolledRequest = CapturedRequest & { fresh?: boolean };

type Loaded = {
  /** Which webhook this page set belongs to. Anything else is stale and reads as empty. */
  webhookId: string | null;
  items: PolledRequest[];
  nextCursor: string | null;
};

const EMPTY: Loaded = { webhookId: null, items: [], nextCursor: null };

type Options = {
  webhookId: string | null;
  /** Called when a poll brings in new rows, so the webhook's counters can be re-read. */
  onNewRequests?: (webhookId: string) => void;
  /** Called when the server 404s the webhook mid-session. */
  onGone?: (webhookId: string) => void;
};

export function useRequests({ webhookId, onNewRequests, onGone }: Options) {
  // One state object stamped with its webhook id: switching webhooks makes the old pages stale
  // by derivation instead of by a reset, so nothing has to be cleared on the way out.
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Callbacks change identity every render; holding them in a ref keeps the poll effect keyed on
  // the webhook id alone, so the interval is created once per webhook and never accumulates.
  const callbacks = useRef({ onNewRequests, onGone });
  useEffect(() => {
    callbacks.current = { onNewRequests, onGone };
  });

  const seenIds = useRef<Set<string>>(new Set());
  const cursorRef = useRef<string | null>(null);

  const loadFirstPage = useCallback(async (id: string, initial: boolean) => {
    const result = await api.listRequests(id, null, PAGE_SIZE);
    if (!result.ok) {
      if (result.error === "gone") callbacks.current.onGone?.(id);
      return;
    }

    const page = result.value;
    const arrivedIds = new Set(
      page.items.filter((item) => !seenIds.current.has(item.id)).map((item) => item.id),
    );
    page.items.forEach((item) => seenIds.current.add(item.id));
    if (initial) cursorRef.current = page.nextCursor;

    setLoaded((current) => {
      // On the first load the page IS the list; afterwards it replaces the page-1 window in
      // place, keyed by id, so a poll never duplicates a row nor drops an older page.
      if (initial) return { webhookId: id, items: page.items, nextCursor: page.nextCursor };
      if (current.webhookId !== id) return current;

      const inPage = new Set(page.items.map((item) => item.id));
      const merged = page.items.map((item) =>
        arrivedIds.has(item.id) ? { ...item, fresh: true } : item,
      );
      return {
        ...current,
        items: [...merged, ...current.items.filter((item) => !inPage.has(item.id))],
      };
    });

    if (!initial && arrivedIds.size > 0) callbacks.current.onNewRequests?.(id);
  }, []);

  // One effect owns both the initial load and the interval; its cleanup clears the timer on every
  // webhook switch, delete and unmount.
  useEffect(() => {
    if (!webhookId) return;

    seenIds.current = new Set();
    cursorRef.current = null;
    void loadFirstPage(webhookId, true);

    const timer = setInterval(() => void loadFirstPage(webhookId, false), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [webhookId, loadFirstPage]);

  const refresh = useCallback(() => {
    if (webhookId) void loadFirstPage(webhookId, true);
  }, [webhookId, loadFirstPage]);

  const loadOlder = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!webhookId || !cursor || loadingOlder) return;

    setLoadingOlder(true);
    try {
      const result = await api.listRequests(webhookId, cursor, PAGE_SIZE);
      if (!result.ok) {
        if (result.error === "gone") callbacks.current.onGone?.(webhookId);
        return;
      }
      const page = result.value;
      const unseen = page.items.filter((item) => !seenIds.current.has(item.id));
      unseen.forEach((item) => seenIds.current.add(item.id));
      cursorRef.current = page.nextCursor;
      setLoaded((current) =>
        current.webhookId === webhookId
          ? { ...current, items: [...current.items, ...unseen], nextCursor: page.nextCursor }
          : current,
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [webhookId, loadingOlder]);

  const current = loaded.webhookId === webhookId ? loaded : EMPTY;

  return {
    requests: current.items,
    nextCursor: current.nextCursor,
    loading: webhookId !== null && loaded.webhookId !== webhookId,
    loadingOlder,
    refresh,
    loadOlder,
  };
}
