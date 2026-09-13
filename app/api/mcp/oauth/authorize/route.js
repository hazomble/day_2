import { authenticateAdmin, createAuthorizationCode, oauthUrls, validateAuthorizationRequest } from "../../../../../lib/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function loginPage(params, error = "") {
  const fields = ["client_id", "redirect_uri", "response_type", "state", "scope", "code_challenge", "code_challenge_method"]
    .map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(params.get(name))}" />`).join("\n");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>ربط Claude بمنصة مدارك</title><style>body{margin:0;background:#f4f7ff;color:#102b63;font-family:Arial,sans-serif}.box{max-width:420px;margin:10vh auto;padding:32px;background:#fff;border-radius:18px;box-shadow:0 14px 40px #102b6330}h1{font-size:24px}label{display:block;margin-top:16px;font-weight:700}input{box-sizing:border-box;width:100%;padding:12px;margin-top:7px;border:1px solid #cbd6ee;border-radius:9px}button{width:100%;margin-top:22px;padding:13px;background:#2855bf;border:0;border-radius:9px;color:#fff;font-weight:700;cursor:pointer}.error{color:#b42318;background:#fff0ef;padding:10px;border-radius:8px}</style></head><body><main class="box"><h1>ربط Claude بمنصة مدارك</h1><p>سجّل بحساب مدير المنصة لتمنح Claude صلاحية إدارة المنصة.</p>${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}<form method="post">${fields}<label>البريد الإلكتروني<input required type="email" name="email" autocomplete="email" /></label><label>كلمة المرور<input required type="password" name="password" autocomplete="current-password" /></label><button type="submit">تأكيد الربط</button></form></main></body></html>`;
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    await validateAuthorizationRequest(params);
    return new Response(loginPage(params), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    return new Response(loginPage(params, error.message), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

export async function POST(request) {
  const formData = await request.formData();
  const params = new URLSearchParams();
  ["client_id", "redirect_uri", "response_type", "state", "scope", "code_challenge", "code_challenge_method"].forEach((name) => params.set(name, String(formData.get(name) || "")));
  try {
    const authorization = await validateAuthorizationRequest(params);
    const admin = await authenticateAdmin(String(formData.get("email") || ""), String(formData.get("password") || ""));
    const code = await createAuthorizationCode({ ...authorization, ...admin });
    const redirect = new URL(authorization.redirectUri);
    redirect.searchParams.set("code", code);
    if (authorization.state) redirect.searchParams.set("state", authorization.state);
    redirect.searchParams.set("iss", oauthUrls(request).issuer);
    return Response.redirect(redirect, 302);
  } catch (error) {
    return new Response(loginPage(params, error.message), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}
