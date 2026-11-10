[Leer en español](README.es.md)

# Macch Plugins

The public catalog of third-party plugins for the Macch agent, the AI agent ISP operators chat with inside Macch Admin. A plugin is a remote [MCP](https://modelcontextprotocol.io) server (Streamable HTTP) that gives the agent new tools: look up a payment, read a document, open an order in your system. Each plugin is one manifest file in [`plugins/`](plugins/). Macch reviews every tool before a plugin appears in the Marketplace inside Macch Admin.

## Connect your system in one prompt

Give your coding agent this prompt:

```text
Read github.com/macch-ai/macch-plugins and its AGENTS.md. Build an MCP server
for <my system> from the template that fits, deploy it, and open a PR adding
its manifest.
```

[`AGENTS.md`](AGENTS.md) holds the full workflow and contract. Agents that load skills can also use [`skills/build-a-plugin/SKILL.md`](skills/build-a-plugin/SKILL.md).

## How a plugin gets listed

1. You deploy an MCP server on a public `https` URL.
2. You open a pull request that adds `plugins/<slug>.json`.
3. Macch reviews every tool, including its `read_only` claim. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
4. Macch merges the PR. The plugin appears in the Marketplace, and each company decides whether to turn it on.

## Private plugins

To use a server only inside your own company, an admin pastes its MCP URL in Macch Admin. No pull request is needed. The same templates work for private plugins.

## The manifest at a glance

| Field | Required | Value |
| --- | --- | --- |
| `slug` | yes | Lowercase words joined by hyphens, max 40 chars, equal to the file name. |
| `name` | yes | Display name. |
| `summary` | yes | One short sentence per locale. `en-US` required; add `es-AR` and `pt-BR`. |
| `publisher` | yes | Who runs the server. |
| `server_url` | yes | `https` URL of the Streamable HTTP MCP endpoint. |
| `connection` | yes | `operator` (each operator signs in) or `company` (one shared account). |
| `auth` | yes | `oauth`, `api_key`, or `none`. |
| `oauth` | no | `{ "scopes": "space separated scopes" }`. |
| `docs_url` | no | `https` link to your docs. |
| `tools` | no | `{ "<tool name>": { "read_only": true } }`. Only listed tools reach the agent. |
| `suggestions` | no | Up to three first questions shown in an empty chat once an operator can use the plugin. |
| `listed` | no | Set by Macch. Default `true`. |
| `review` | no | Set by Macch. Default `1`. |

Full rules: [`AGENTS.md`](AGENTS.md#the-manifest). JSON Schema: [`schema/plugin.schema.json`](schema/plugin.schema.json). Examples: [`plugins/`](plugins/).

## Templates

- [`templates/python/`](templates/python/): official MCP Python SDK, Streamable HTTP, pytest.
- [`templates/typescript/`](templates/typescript/): official `@modelcontextprotocol/sdk`, Streamable HTTP.

Each template's README has its run, test, and deploy steps.

## Validate

Requires Node.js 22 or later.

```sh
npm install
npm run validate   # check every manifest in plugins/
npm test
```

CI runs the same checks on every pull request.

## License

[MIT](LICENSE). Report security issues as described in [`SECURITY.md`](SECURITY.md).
