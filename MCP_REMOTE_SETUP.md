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

## Connect from Claude Chat Free

Claude Free supports one custom remote connector. In Claude Chat:

1. Open **Customize → Connectors → + → Add custom connector**.
2. Set a name such as `Madarek Admin`.
3. Use this exact URL, replacing the two placeholders:

```text
https://YOUR-VERCEL-DOMAIN/api/mcp?mcp_key=YOUR_MCP_API_TOKEN
```

4. Add the connector, then enable it for the conversation from the **+ → Connectors** menu.

The `mcp_key` value is accepted only as a compatibility option for Claude Chat's URL-only custom-connector setup. Treat the complete URL as a password: do not share it, put it in screenshots, commit it to GitHub, or paste it in a public chat. The endpoint still accepts the safer `Authorization: Bearer ...` header for tools that support custom headers.

## Production upgrade

For multiple people or a real platform, replace the URL key with OAuth or an identity-aware proxy. Never remove authentication entirely: these MCP tools can create accounts, change access, and publish courses.
