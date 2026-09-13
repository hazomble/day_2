import { exchangeAuthorizationCode } from "../../../../../lib/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const params = await request.formData();
    if (params.get("grant_type") !== "authorization_code") throw new Error("Only authorization_code is supported.");
    return Response.json(await exchangeAuthorizationCode(params));
  } catch (error) {
    return Response.json({ error: "invalid_grant", error_description: error.message }, { status: 400 });
  }
}
