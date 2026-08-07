import type { NextRequest } from "next/server";
import { getWebhook, listCapturedRequests } from "@/lib/db";
import { notFound, serializeCapturedRequest } from "@/lib/http";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getWebhook(id))) return notFound();

  const { searchParams } = request.nextUrl;
  const requestedLimit = Number(searchParams.get("limit"));
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const cursor = searchParams.get("cursor");

  const page = await listCapturedRequests(id, limit, cursor);
  return Response.json({ items: page.items.map(serializeCapturedRequest), nextCursor: page.nextCursor });
}
