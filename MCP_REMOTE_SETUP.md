# Remote MCP for the Madarek platform

The Vercel deployment exposes a protected MCP endpoint at:

```text
https://YOUR-VERCEL-DOMAIN/api/mcp
```

It uses the Streamable HTTP MCP transport and provides these administration tools:

- `platform_status`
- `list_users`
- `list_courses`
- `create_platform_user`
- `set_user_access`
- `set_course_status`

## Required Vercel secrets

In **Vercel → Project → Settings → Environment Variables**, add these server-side variables for Production (and Preview only if you need it there):

```text
FIREBASE_SERVICE_ACCOUNT_JSON={the complete JSON from a Firebase service-account private key}
MCP_API_TOKEN={a randomly generated secret of at least 32 characters}
```

Do not use a `NEXT_PUBLIC_` prefix. Do not commit either value to GitHub. The service-account key is downloaded from **Firebase Console → Project settings → Service accounts → Generate new private key**.

After saving the variables, redeploy Vercel. Test the endpoint only with a client that sends:

```http
Authorization: Bearer YOUR_MCP_API_TOKEN
```

## Claude Chat connection note

This endpoint is intentionally not public: it can create accounts and disable users. A Claude Chat custom connector must be able to authenticate to it. Claude's remote custom connector supports OAuth or an unauthenticated endpoint; a static bearer token is not a safe unauthenticated alternative.

For Claude Chat, the secure production follow-up is OAuth (or an identity-aware proxy) in front of `/api/mcp`. Never remove the token check to make the connector work. If using Claude Desktop / Claude Code locally, configure its MCP client to send the endpoint and bearer token, or use the existing local filesystem MCP for source-code access.
