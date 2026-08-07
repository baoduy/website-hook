import type { NextRequest } from "next/server";
import { MAX_BODY_BYTES } from "@/lib/constants";
import { getWebhook, insertCapturedRequest, touchWebhook } from "@/lib/db";
import { notFound, readBoundedBody } from "@/lib/http";

type CaptureParams = { params: Promise<{ id: string; path?: string[] }> };

// Always returns 200 to the caller (spec R4) — a storage failure is logged, never surfaced.
async function capture(request: NextRequest, { params }: CaptureParams) {
  const { id, path } = await params;
  if (!getWebhook(id)) return notFound();

  const { body, truncated } = await readBoundedBody(request, MAX_BODY_BYTES);
  const subPath = path && path.length > 0 ? `/${path.join("/")}` : "";
  const query = request.nextUrl.search.replace(/^\?/, "");
  const headers = Object.fromEntries(request.headers.entries());

  try {
    insertCapturedRequest(id, { method: request.method, path: subPath, query, headers, body, truncated });
    touchWebhook(id);
  } catch (err) {
    console.error(`capture storage failed for webhook ${id}:`, err);
  }

  return new Response(null, { status: 200 });
}

export const GET = capture;
export const POST = capture;
export const PUT = capture;
export const PATCH = capture;
export const DELETE = capture;
export const HEAD = capture;
export const OPTIONS = capture;
