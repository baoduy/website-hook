import { beforeEach, describe, expect, it } from "vitest";
import { MAX_REMEMBERED_WEBHOOKS, STORAGE_KEY } from "@/lib/constants";
import { addId, clearIds, readIds, removeId, writeIds } from "./storage";

// In-memory Storage so the localStorage fallbacks are exercisable without a browser.
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

let storage: Storage;
beforeEach(() => {
  storage = makeStorage();
});

describe("readIds", () => {
  it("returns [] when nothing is stored", () => {
    expect(readIds(storage)).toEqual([]);
  });
  it("round-trips ids written by writeIds", () => {
    writeIds(storage, ["a", "b"]);
    expect(readIds(storage)).toEqual(["a", "b"]);
  });
  it("recovers from corrupt (non-JSON) storage by returning []", () => {
    storage.setItem(STORAGE_KEY, "{not json");
    expect(readIds(storage)).toEqual([]);
  });
  it("recovers from wrong-shape (non-array) JSON by returning []", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ not: "an array" }));
    expect(readIds(storage)).toEqual([]);
  });
  it("filters out non-string and empty entries", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify(["a", 3, null, "", "b"]));
    expect(readIds(storage)).toEqual(["a", "b"]);
  });
  it("deduplicates ids", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify(["a", "a", "b", "b"]));
    expect(readIds(storage)).toEqual(["a", "b"]);
  });
  it("caps at MAX_REMEMBERED_WEBHOOKS", () => {
    const many = Array.from({ length: MAX_REMEMBERED_WEBHOOKS + 3 }, (_, i) => `w${i}`);
    writeIds(storage, many);
    expect(readIds(storage)).toHaveLength(MAX_REMEMBERED_WEBHOOKS);
  });
  it("returns [] when the storage throws on read", () => {
    const broken: Storage = {
      ...storage,
      getItem: () => {
        throw new Error("denied");
      },
    };
    expect(readIds(broken)).toEqual([]);
  });
});

describe("writeIds", () => {
  it("writes capped, deduped ids and returns exactly what was stored", () => {
    const stored = writeIds(storage, ["b", "b", "a", ...Array.from({ length: 10 }, () => "a")]);
    expect(stored).toEqual(["b", "a"]);
    expect(readIds(storage)).toEqual(["b", "a"]);
  });
  it("survives a blocked setItem (returns the capped list anyway)", () => {
    const blocked: Storage = {
      ...storage,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(writeIds(blocked, ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("addId", () => {
  it("prepends the new id newest-first and persists", () => {
    writeIds(storage, ["a", "b"]);
    expect(addId(storage, ["a", "b"], "c")).toEqual(["c", "a", "b"]);
    expect(readIds(storage)).toEqual(["c", "a", "b"]);
  });
  it("enforces the cap when adding past it", () => {
    const ids = ["w1", "w2", "w3", "w4", "w5"];
    const result = addId(storage, ids, "w6");
    expect(result).toHaveLength(MAX_REMEMBERED_WEBHOOKS);
    expect(result[0]).toBe("w6");
    expect(result).not.toContain("w5");
  });
});

describe("removeId", () => {
  it("drops only the named id and persists", () => {
    writeIds(storage, ["a", "b", "c"]);
    expect(removeId(storage, ["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(readIds(storage)).toEqual(["a", "c"]);
  });
  it("is a no-op when the id is not present", () => {
    writeIds(storage, ["a"]);
    expect(removeId(storage, ["a"], "missing")).toEqual(["a"]);
  });
  it("frees a slot — adding after remove stays under the cap", () => {
    const ids = ["w1", "w2", "w3", "w4", "w5"];
    writeIds(storage, ids);
    const afterRemove = removeId(storage, ids, "w3");
    expect(afterRemove).toHaveLength(4);
    const afterAdd = addId(storage, afterRemove, "w6");
    expect(afterAdd).toHaveLength(5);
    expect(afterAdd[0]).toBe("w6");
  });
});

describe("clearIds", () => {
  it("removes the key and returns []", () => {
    writeIds(storage, ["a", "b"]);
    expect(clearIds(storage)).toEqual([]);
    expect(readIds(storage)).toEqual([]);
  });
  it("survives a throwing removeItem", () => {
    const broken: Storage = {
      ...storage,
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(clearIds(broken)).toEqual([]);
  });
});