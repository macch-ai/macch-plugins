# TypeScript plugin template

A minimal remote MCP server for Macch's agent, built on the official
[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
(Streamable HTTP, stateless, JSON responses).

It ships two example tools for a field work-order system:

| Tool | Changes data | What the agent does |
| --- | --- | --- |
| `search_work_orders` | No (`readOnlyHint: true`) | Runs it without asking the operator. |
| `add_work_order_note` | Yes | Asks the operator before running it. |

Replace the in-memory sample data in `src/server.ts` with calls to your own system.

## Run

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run build
PLUGIN_API_KEY=change-me npm start
```

The server listens on `http://0.0.0.0:3000/mcp` (`PORT` and `HOST` change it).
`GET /healthz` returns `{"status":"ok"}` for load balancer checks.

Try it:

```sh
curl -s http://localhost:3000/mcp \
  -H 'Authorization: Bearer change-me' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Test

```sh
npm test
```

The test starts the server on a free port and calls `tools/list` and `tools/call`
through the SDK client, the same way Macch's agent does.

## Design your tools

- One tool per user goal. Name it with a verb (`search_…`, `create_…`), lowercase with `_`.
- Write the description for the agent: what it does, when to use it, what it returns.
- Set `readOnlyHint: true` only on tools that never change data. Macch checks this in review.
- Return short JSON. On failure, return `isError: true` with an English message that
  names the next step (see `add_work_order_note`).
- Keep names, descriptions, input schemas, annotations, and `_meta` stable once listed.
  Macch fingerprints each tool; a changed tool is hidden until Macch reviews it again.

## Authentication

This template uses `"auth": "api_key"`: Macch sends `Authorization: Bearer <key>`
on every request, and the server answers `401` when the key is missing or wrong.
Set the key with `PLUGIN_API_KEY`; the admin or operator enters the same key in Macch Admin.

For `"auth": "oauth"`, replace the API-key check with access-token validation and
implement the [MCP authorization spec](https://modelcontextprotocol.io/specification/latest/basic/authorization):

- Answer `401` with `WWW-Authenticate: Bearer resource_metadata="<url>"`.
- Serve RFC 9728 protected-resource metadata (`/.well-known/oauth-protected-resource`).
- Your authorization server serves RFC 8414 metadata whose `issuer` equals the issuer URL it is fetched for.
- Support PKCE `S256` and the RFC 8707 `resource` parameter; reject tokens issued for another resource.
- Use `https` for every endpoint.
- Support Dynamic Client Registration, or ask Macch to pre-register a client.

The SDK has helpers for this, as Express middleware and routers:
`requireBearerAuth` from `@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js` and
`mcpAuthMetadataRouter` from `@modelcontextprotocol/sdk/server/auth/router.js`. To use them, serve
`/mcp` from an Express app; or keep `node:http` and write the token check and the
`/.well-known/oauth-protected-resource` response yourself.

## Deploy

Deploy anywhere that serves the container over public HTTPS:

```sh
docker build -t my-plugin .
docker run -p 3000:3000 -e PLUGIN_API_KEY=change-me my-plugin
```

The server is stateless, so you can run several instances behind a load balancer.
Terminate TLS at your host or proxy. Macch only connects to public `https` URLs.

## List it in the Marketplace

Open a pull request that adds `plugins/<slug>.json` to
[macch-ai/macch-plugins](https://github.com/macch-ai/macch-plugins).
The file name must equal `slug`. For this template:

```json
{
  "$schema": "https://raw.githubusercontent.com/macch-ai/macch-plugins/main/schema/plugin.schema.json",
  "slug": "example-workorders",
  "name": "Example Work Orders",
  "summary": {
    "en-US": "Find field work orders and leave notes for technicians.",
    "es-AR": "Buscá órdenes de trabajo y dejá notas para los técnicos.",
    "pt-BR": "Encontre ordens de serviço e deixe notas para os técnicos."
  },
  "publisher": "Example Inc.",
  "server_url": "https://mcp.example.com/mcp",
  "connection": "company",
  "auth": "api_key",
  "docs_url": "https://example.com/docs/mcp",
  "tools": {
    "search_work_orders": { "read_only": true },
    "add_work_order_note": { "read_only": false }
  }
}
```

- `connection`: `"company"` for one shared account an admin connects, `"operator"`
  when each operator signs in with their own account.
- `tools`: only tools listed here reach the agent. `read_only: true` lets the agent
  run the tool without asking the operator.
- The agent sees tool names as `<slug>_<tool>`, for example `example-workorders_search_work_orders`.

A private plugin for your own company needs no pull request: add the server URL in Macch Admin.
