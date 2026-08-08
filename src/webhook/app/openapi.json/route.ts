import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import spec from "@/lib/openapi.json";
import { withRequestServerUrl } from "@/lib/openapi";

export async function GET(request: NextRequest) {
  return NextResponse.json(withRequestServerUrl(spec, request));
}
