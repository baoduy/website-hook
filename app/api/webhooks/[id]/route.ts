import { deleteWebhook, getWebhook } from "@/lib/db";
import { notFound, serializeWebhook } from "@/lib/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const webhook = await getWebhook(id);
  if (!webhook) return notFound();

  return Response.json(serializeWebhook(webhook));
}

// Idempotent: deleting an already-gone webhook still returns 204 (spec R3).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteWebhook(id);
  return new Response(null, { status: 204 });
}
