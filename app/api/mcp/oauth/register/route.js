import { registerClient } from "../../../../../lib/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    return Response.json(await registerClient(request), { status: 201 });
  } catch (error) {
    return Response.json({ error: "invalid_client_metadata", error_description: error.message }, { status: 400 });
  }
}
