import { getCapturedRequest, getWebhook } from "@/lib/db";
import { notFound, serializeCapturedRequest } from "@/lib/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const { id, requestId } = await params;
  if (!(await getWebhook(id))) return notFound();

  const captured = await getCapturedRequest(id, requestId);
  if (!captured) return notFound();

  return Response.json(serializeCapturedRequest(captured));
}
