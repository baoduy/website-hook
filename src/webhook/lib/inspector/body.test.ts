import { describe, expect, it } from "vitest";
import { base64Bytes, decodeBody, decodeBodyText, prettyJson } from "./body";

const enc = (text: string) => Buffer.from(text, "utf-8").toString("base64");
const encBytes = (...bytes: number[]) =>
  Buffer.from(bytes).toString("base64");

describe("prettyJson", () => {
  it("pretty-prints a JSON object", () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it("pretty-prints a JSON array", () => {
    expect(prettyJson("[1,2]")).toBe("[\n  1,\n  2\n]");
  });

  it.each(["42", '"ok"', "null", "true"])("falls through for scalar %q", (value) => {
    expect(prettyJson(value)).toBeNull();
  });

  it("returns null for non-JSON", () => {
    expect(prettyJson("{not json")).toBeNull();
    expect(prettyJson("")).toBeNull();
  });
});

describe("base64Bytes", () => {
  it("measures decoded length from the base64 length (3 bytes per 4 chars)", () => {
    expect(base64Bytes(enc("abc"))).toBe(3);
    expect(base64Bytes(enc("a"))).toBe(1);
  });

  it("ignores padding and empty input", () => {
    expect(base64Bytes("")).toBe(0);
    expect(base64Bytes("====")).toBe(0);
  });
});

describe("decodeBody", () => {
  it("decodes a JSON body as json with text and pretty forms", () => {
    const decoded = decodeBody(enc('{"a":1}'));
    expect(decoded).toMatchObject({ kind: "json", byteLength: 7 });
    expect((decoded as { pretty: string }).pretty).toBe('{\n  "a": 1\n}');
  });

  it("decodes a non-JSON text body as text", () => {
    const decoded = decodeBody(enc("hello world"));
    expect(decoded).toMatchObject({ kind: "text", byteLength: 11, text: "hello world" });
  });

  it("an empty (zero-byte) body is empty, not binary", () => {
    const decoded = decodeBody("");
    expect(decoded).toEqual({ kind: "empty", byteLength: 0 });
  });

  it("undecodable UTF-8 degrades to binary with a measured byte count", () => {
    // 0xFF is invalid as a standalone UTF-8 leading byte.
    const decoded = decodeBody(encBytes(0xff));
    expect(decoded).toMatchObject({ kind: "binary", byteLength: 1 });
  });

  it("invalid base64 degrades to binary using the base64 length estimate", () => {
    const decoded = decodeBody("!!!not base64!!!");
    expect(decoded).toMatchObject({ kind: "binary", byteLength: base64Bytes("!!!not base64!!!") });
  });

  it("a bare JSON scalar falls through to text, not json", () => {
    const decoded = decodeBody(enc("42"));
    expect(decoded).toMatchObject({ kind: "text", byteLength: 2, text: "42" });
  });
});

describe("decodeBodyText", () => {
  it("returns the text for json and text bodies", () => {
    expect(decodeBodyText(enc('{"a":1}'))).toBe('{"a":1}');
    expect(decodeBodyText(enc("plain"))).toBe("plain");
  });

  it("returns an empty string for empty and binary bodies (cURL/search want this)", () => {
    expect(decodeBodyText("")).toBe("");
    expect(decodeBodyText(encBytes(0xff))).toBe("");
  });
});