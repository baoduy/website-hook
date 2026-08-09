// Minimal browser API stubs the inspector components reach for that happy-dom does not
// ship, kept in one place so every component test file imports it. Importing this is what
// opts a file into the component surface; it never touches the node-environment server suite.
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// happy-dom 18 does not wire window.localStorage by default in vitest; the inspector stores
// remembered webhook ids there. Install a minimal memory-backed localStorage before any test
// mounts a component that reads it, so hydrate/persist behaviour is exercisable without a real UA.
if (typeof window !== "undefined" && !window.localStorage) {
  const store = new Map<string, string>();
  const ls: Storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", { value: ls, configurable: true });
}

// happy-dom lacks matchMedia; the sidebar primitive and use-mobile read it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// Clipboard is absent in insecure/embedded contexts — the components guard for that, so we
// provide a controllable stub the copy tests can override per-case.
if (!navigator.clipboard) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
}

// happy-dom does not implement URL.createObjectURL; the body download uses it.
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn().mockReturnValue("blob:stub");
  URL.revokeObjectURL = vi.fn();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});