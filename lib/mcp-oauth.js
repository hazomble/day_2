import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "./firebase-admin";

const TOKEN_LIFETIME_SECONDS = 60 * 60;
const CODE_LIFETIME_SECONDS = 5 * 60;

function randomValue() {
  return randomBytes(32).toString("base64url");
}

function issuerFor(request) {
  return new URL(request.url).origin;
}

function isAdminUser(decodedToken, profile) {
  return decodedToken.admin === true || decodedToken.email?.toLowerCase() === "mag65@gmail.com" || profile?.role === "admin";
}

export function oauthUrls(request) {
  const issuer = issuerFor(request);
  return {
    issuer,
    authorizationEndpoint: `${issuer}/api/mcp/oauth/authorize`,
    tokenEndpoint: `${issuer}/api/mcp/oauth/token`,
    registrationEndpoint: `${issuer}/api/mcp/oauth/register`,
    resourceMetadata: `${issuer}/api/mcp/oauth/protected-resource`,
  };
}

export function resourceMetadata(request) {
  const urls = oauthUrls(request);
  return {
    resource: `${urls.issuer}/api/mcp`,
    authorization_servers: [urls.issuer],
    scopes_supported: ["madarek.admin"],
  };
}

export function authorizationServerMetadata(request) {
  const urls = oauthUrls(request);
  return {
    issuer: urls.issuer,
    authorization_endpoint: urls.authorizationEndpoint,
    token_endpoint: urls.tokenEndpoint,
    registration_endpoint: urls.registrationEndpoint,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["madarek.admin"],
  };
}

export async function registerClient(request) {
  const metadata = await request.json();
  const redirectUris = Array.isArray(metadata.redirect_uris) ? metadata.redirect_uris : [];

  if (!redirectUris.length || redirectUris.some((uri) => typeof uri !== "string" || !uri.startsWith("https://"))) {
    throw new Error("A secure HTTPS redirect URI is required.");
  }

  const clientId = `claude_${randomValue()}`;
  const { db } = getFirebaseAdmin();
  await db.collection("mcp_oauth_clients").doc(clientId).set({
    clientId,
    clientName: typeof metadata.client_name === "string" ? metadata.client_name.slice(0, 120) : "MCP client",
    redirectUris,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    token_endpoint_auth_method: "none",
    redirect_uris: redirectUris,
    grant_types: ["authorization_code"],
    response_types: ["code"],
  };
}

export async function validateAuthorizationRequest(params) {
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const responseType = params.get("response_type");
  const codeChallenge = params.get("code_challenge");
  const method = params.get("code_challenge_method");

  if (!clientId || !redirectUri || responseType !== "code" || !codeChallenge || method !== "S256") {
    throw new Error("Invalid OAuth authorization request.");
  }

  const { db } = getFirebaseAdmin();
  const client = await db.collection("mcp_oauth_clients").doc(clientId).get();
  if (!client.exists || !client.data().redirectUris.includes(redirectUri)) {
    throw new Error("Unregistered OAuth client or redirect URI.");
  }

  return { clientId, redirectUri, codeChallenge, state: params.get("state") || "", scope: params.get("scope") || "madarek.admin" };
}

export async function authenticateAdmin(email, password) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is not configured on Vercel.");

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!response.ok) throw new Error("Invalid email or password.");

  const result = await response.json();
  const { auth, db } = getFirebaseAdmin();
  const decodedToken = await auth.verifyIdToken(result.idToken);
  const profile = await db.collection("users").doc(decodedToken.uid).get();
  if (!isAdminUser(decodedToken, profile.exists ? profile.data() : null)) {
    throw new Error("Only the platform administrator may authorize this connector.");
  }

  return { uid: decodedToken.uid, email: decodedToken.email || email };
}

export async function createAuthorizationCode({ clientId, redirectUri, codeChallenge, uid, email, scope }) {
  const code = randomValue();
  const { db } = getFirebaseAdmin();
  await db.collection("mcp_oauth_codes").doc(code).set({
    clientId,
    redirectUri,
    codeChallenge,
    uid,
    email,
    scope,
    expiresAtMs: Date.now() + CODE_LIFETIME_SECONDS * 1000,
    createdAt: FieldValue.serverTimestamp(),
  });
  return code;
}

export async function exchangeAuthorizationCode(params) {
  const code = params.get("code");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const verifier = params.get("code_verifier");
  if (!code || !clientId || !redirectUri || !verifier) throw new Error("Invalid token request.");

  const { db } = getFirebaseAdmin();
  const codeRef = db.collection("mcp_oauth_codes").doc(code);
  const codeData = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(codeRef);
    if (!snapshot.exists) throw new Error("Authorization code is invalid or already used.");
    const value = snapshot.data();
    transaction.delete(codeRef);
    return value;
  });
  const verifierHash = createHash("sha256").update(verifier).digest("base64url");
  if (codeData.expiresAtMs < Date.now() || codeData.clientId !== clientId || codeData.redirectUri !== redirectUri || codeData.codeChallenge !== verifierHash) {
    throw new Error("Authorization code validation failed.");
  }

  const accessToken = randomValue();
  await db.collection("mcp_oauth_tokens").doc(accessToken).set({
    uid: codeData.uid,
    email: codeData.email,
    scope: codeData.scope,
    expiresAtMs: Date.now() + TOKEN_LIFETIME_SECONDS * 1000,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { access_token: accessToken, token_type: "Bearer", expires_in: TOKEN_LIFETIME_SECONDS, scope: codeData.scope };
}

export async function hasMcpAccess(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;

  // Kept as a break-glass credential for non-Claude MCP clients. Claude Chat
  // obtains an expiring OAuth token instead.
  const emergencyToken = process.env.MCP_API_TOKEN;
  if (emergencyToken) {
    const expected = Buffer.from(emergencyToken);
    const received = Buffer.from(token);
    if (expected.length === received.length && timingSafeEqual(expected, received)) return true;
  }

  const { db } = getFirebaseAdmin();
  const record = await db.collection("mcp_oauth_tokens").doc(token).get();
  return record.exists && record.data().expiresAtMs > Date.now() && record.data().scope?.split(" ").includes("madarek.admin");
}
