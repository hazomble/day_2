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
```

Do not use a `NEXT_PUBLIC_` prefix. Do not commit either value to GitHub. The service-account key is downloaded from **Firebase Console → Project settings → Service accounts → Generate new private key**.

`MCP_API_TOKEN` remains optional as an emergency token for non-Claude MCP clients. Claude Chat does not use it.

After saving the variables, redeploy Vercel. The platform's existing `NEXT_PUBLIC_FIREBASE_API_KEY` must also be present in Vercel because the OAuth sign-in form uses Firebase Authentication.

Test the endpoint only with a client that sends:

```http
Authorization: Bearer YOUR_MCP_API_TOKEN
```

## Connect from Claude Chat Free

Claude Free supports one custom remote connector. In Claude Chat:

1. Open **Customize → Connectors → + → Add custom connector**.
2. Set a name such as `Madarek Admin`.
3. Use this exact URL:

```text
https://YOUR-VERCEL-DOMAIN/api/mcp
```

4. Add the connector. Claude opens the Madarek sign-in page; sign in with the administrator account (`mag65@gmail.com`).
5. Enable it for the conversation from the **+ → Connectors** menu.

OAuth issues a short-lived access token to Claude after the admin login. Passwords and Firebase service-account values are never sent to Claude or returned by MCP tools.

## Production upgrade

For multiple people or a real platform, move OAuth client, authorization-code, and token storage from Firestore to a dedicated identity provider with consent/audit controls. Never remove authentication entirely: these MCP tools can create accounts, change access, and publish courses.
