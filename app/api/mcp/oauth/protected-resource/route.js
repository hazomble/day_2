import { resourceMetadata } from "../../../../../lib/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request) {
  return Response.json(resourceMetadata(request));
}
