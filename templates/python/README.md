# Python plugin template

A minimal MCP server for Macch's agent, built on the official [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) (`mcp` 2.x). It serves Streamable HTTP at `/mcp` with stateless JSON responses, so it runs on any host that serves HTTPS, serverless included.

It ships two example tools over a sample in-memory store:

| Tool | What it does | Annotations |
| --- | --- | --- |
| `find_work_orders` | Looks up work orders by customer, address, or ID. | `readOnlyHint: true` |
| `add_work_order_note` | Appends a note to a work order. | `readOnlyHint: false`, `destructiveHint: false` |

Replace `WORK_ORDERS` in `server.py` with calls to your own system.

## Run locally

Requires [uv](https://docs.astral.sh/uv/).

```bash
uv sync
PLUGIN_API_KEY=local-key uv run server.py
```

The server listens on `http://127.0.0.1:8000/mcp`. `HOST` and `PORT` override the bind address. Try it:

```bash
curl -s http://127.0.0.1:8000/mcp \
  -H 'Authorization: Bearer local-key' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_work_orders","arguments":{"query":"jane"}}}'
```

## Test

```bash
uv run pytest
```

The tests start the app in-process and drive it with the SDK's MCP client over Streamable HTTP. They also check that `plugin.example.json` lists every tool with a `read_only` flag that matches its `readOnlyHint`. Keep that test when you rename the file.

## Authentication

The template uses `"auth": "api_key"`: Macch sends the key as `Authorization: Bearer <key>` on every request, and the server answers `401` when it is missing or wrong. The server refuses to start without `PLUGIN_API_KEY`.

For `"auth": "oauth"`, remove `BearerKeyMiddleware` and pass a `token_verifier` and `auth=AuthSettings(issuer_url=..., resource_server_url=..., required_scopes=[...])` to `MCPServer`. The SDK then serves the RFC 9728 protected-resource metadata and points `401` responses at it. Your authorization server must publish RFC 8414 metadata, support PKCE (S256) and resource indicators (RFC 8707), and offer Dynamic Client Registration or a client Macch registers in advance.

## Deploy

Build the image and run it on any platform that terminates HTTPS on a public hostname (Cloud Run, Fly.io, Render, a VM behind a reverse proxy):

```bash
docker build -t my-plugin .
docker run -p 8000:8000 -e PLUGIN_API_KEY=... my-plugin
```

Store `PLUGIN_API_KEY` in the platform's secret manager. Macch only connects to public `https://` URLs.

## List it in Macch

1. In a fork of [macch-ai/macch-plugins](https://github.com/macch-ai/macch-plugins), copy `plugin.example.json` to `plugins/<slug>.json`. The file name must equal `slug`.
2. Set `slug`, `name`, `publisher`, `summary` (`en-US` required; add `es-AR` and `pt-BR`), and `server_url` (your `https://.../mcp` endpoint).
3. Set `connection`: `company` for one shared account an admin connects, or `operator` for one sign-in per operator.
4. List every tool under `tools`. Mark `read_only: true` only for tools that never change data: Macch runs those without asking the operator and verifies the flag in review. Unlisted tools are never shown to the agent.
5. Open a pull request against macch-ai/macch-plugins. Macch reviews each tool before listing it.

Once listed, keep tool names, descriptions, input schemas, annotations, and `_meta` stable. A changed tool is hidden from the agent until Macch reviews it again.

For a private plugin, skip the pull request: an admin adds the server URL in Macch Admin.
