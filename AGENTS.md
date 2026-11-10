# AGENTS.md

Instructions for a coding agent that connects a system to the Macch agent. The Macch agent is the AI agent ISP operators chat with inside Macch Admin. Operators are mostly Spanish and Portuguese speakers.

Your output is two things: a deployed remote MCP server, and a pull request that adds one manifest file to this repo.

## Steps

1. **Scope.** Pick the 3 to 10 operator jobs the system should support, such as "find a customer's invoice" or "create a work order". Each job becomes one tool.
2. **Start from a template.** Copy [`templates/python/`](templates/python/) or [`templates/typescript/`](templates/typescript/) into its own repo, outside this one. Both use the official MCP SDK over Streamable HTTP. Follow the template's README.
3. **Build the tools.** Follow [Tool design](#tool-design).
4. **Choose auth.** Follow [Auth](#auth).
5. **Test.** Run the template's tests, then call every tool over HTTP.
6. **Deploy** on a public `https` URL. Confirm it from outside your network.
7. **Write the manifest** at `plugins/<slug>.json`. Follow [The manifest](#the-manifest).
8. **Validate.** Run `npm install`, then `npm run validate` and `npm test` at the root of this repo.
9. **Open the PR.** Follow [Pull request](#pull-request).

For a private plugin, stop after step 6. A company admin pastes the server URL in Macch Admin. No PR is needed. With `auth: oauth`, a private plugin must support Dynamic Client Registration for public clients (`token_endpoint_auth_method: none`) and must grant usable access when no `scope` is requested: Macch pre-registers clients and sends `oauth.scopes` only for listed plugins.

## The manifest

One file per plugin: `plugins/<slug>.json`. Macch Core enforces these rules. [`schema/plugin.schema.json`](schema/plugin.schema.json) encodes the field rules; `npm run validate` also checks the file-name match, unique slugs, and tool-name length.

```json
{
  "$schema": "https://raw.githubusercontent.com/macch-ai/macch-plugins/main/schema/plugin.schema.json",
  "slug": "acme-billing",
  "name": "Acme Billing",
  "summary": {
    "en-US": "Look up invoices and payments in Acme Billing.",
    "es-AR": "Consultá facturas y pagos en Acme Billing.",
    "pt-BR": "Consulte faturas e pagamentos no Acme Billing."
  },
  "publisher": "Acme Inc.",
  "server_url": "https://mcp.acme.example/mcp",
  "connection": "company",
  "auth": "api_key",
  "docs_url": "https://docs.acme.example/mcp",
  "tools": {
    "find_invoices": { "read_only": true },
    "record_payment": { "read_only": false }
  },
  "suggestions": [
    {
      "id": "unpaid-invoices",
      "icon": "wallet",
      "text": {
        "en-US": "Which invoices are unpaid?",
        "es-AR": "¿Qué facturas están impagas?",
        "pt-BR": "Quais faturas estão em aberto?"
      }
    }
  ]
}
```

Required fields:

- `slug`: matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`, at most 40 characters, equal to the file name without `.json`. Reserved, so never valid: `tickets`, `customers`, `hub`, `memory`, `tool`. The model sees each tool as `<slug>_<tool>`. Slugs never contain `_`, so every name has one owner.
- `name`: display name.
- `summary`: object keyed by locale. `en-US` is required. Add `es-AR` and `pt-BR`; most operators read those. One short sentence about user value, with no implementation detail.
- `publisher`: who runs the server.
- `server_url`: `https` URL of the Streamable HTTP MCP endpoint. It must be on the public internet. At runtime Macch refuses private, loopback, and cloud metadata addresses.
- `connection`: `operator` (each operator signs in with their own account) or `company` (one shared account that an admin connects).
- `auth`: `oauth`, `api_key`, or `none`. See [Auth](#auth).

Optional fields:

- `oauth`: `{ "scopes": "space separated scopes" }`. Request only the scopes the tools need.
- `docs_url`: `https` link to your documentation.
- `icon`: your brand mark on the plugin's Marketplace card. Without it, the card shows the first letter of `name`.
  - `path`: the `d` attribute of one SVG `<path>` drawn on a `0 0 24 24` viewBox, at most 8,000 characters. Path commands and numbers only: no `<svg>` markup, images, or URLs. [Simple Icons](https://simpleicons.org) publishes marks in this exact shape for many brands.
  - `color`: optional brand color as `#RRGGBB`. Omit it for a black mark, so the icon follows the light or dark theme.
- `tools`: maps each MCP tool name to `{ "read_only": boolean }`.
  - Only tools listed here are ever shown to the agent. A tool your server exposes but the manifest omits stays hidden.
  - `read_only: true` lets the agent run the tool without asking the operator. Macch verifies the claim in review.
  - Every other listed tool asks the operator before each run.
- `suggestions`: up to three first questions the agent offers in an empty chat once an operator can use the plugin, so operators discover what it does. Each has:
  - `id`: lowercase words joined by hyphens, unique within the manifest.
  - `icon`: one of the names in the `icon` enum of `schema/plugin.schema.json`, such as `sparkles` or `chart-line`.
  - `text`: the question keyed by locale. `en-US` is required; add `es-AR` and `pt-BR`. Write what an operator would type, under about 30 characters, with no sample customer data.
- `listed`: boolean, default `true`. Macch sets `false` to hide a plugin. Do not set it.
- `staff_only`: boolean, default `false`. Macch sets `true` on its own test plugins so only Macch staff see them in the Marketplace. Do not set it.
- `review`: positive integer, default `1`. Macch raises it when it re-reviews a tool whose `read_only` flag did not change. Do not set it.

No other top-level keys are allowed besides `$schema`.

**Fingerprints.** Macch fingerprints each reviewed tool's description, input schema, annotations, and `_meta`. If any of these changes on your server, Macch hides that tool until it reviews it again. Treat a shipped tool definition as frozen. To change behavior, add a tool with a new name and list it in a PR. Then remove the old one.

## Tool design

- **Few, goal-shaped tools.** One tool per operator job, such as `find_customer` rather than `get_customer_by_id` plus `get_customer_by_email`. Prefer fewer, richer tools.
- **Names.** Lowercase letters, digits, `_`, or `-`. Keep `<slug>_<tool>` within 64 characters.
- **Descriptions are for a model.** In English, state what the tool does, when to use it, and what it returns. Describe each parameter and its format. Keep it short.
- **Stable definitions.** Do not change names, descriptions, schemas, annotations, or `_meta` casually. See Fingerprints above.
- **Honest annotations.** Set `readOnlyHint: true` only when the tool changes nothing anywhere. Its manifest `read_only` value must match. Set `destructiveHint` and `idempotentHint` honestly on write tools.
- **Short structured results.** Return only the fields an operator needs, with stable keys. Paginate or cap lists. Never return raw upstream payloads.
- **No secrets in results.** Never return tokens, API keys, passwords, or internal URLs in results or error messages.
- **Useful errors.** On failure, return a tool error (`isError: true`) with a short English message that names the next action, such as "No customer matches that email. Search by name instead." Log the details on your side.
- **Fast.** Answer each call well within 30 seconds.
- **Scoped to the caller.** Every call acts only on data the authenticated account may access.

## Auth

**`connection`:**

- `operator`: the system has per-user accounts and permissions, and actions should be attributed to the person. Each operator signs in once.
- `company`: the system has one account per company, or an integration account. An admin connects it once for everyone.

**`auth`:**

- `oauth`: preferred when the system has user sign-in. Your server must implement the MCP authorization spec:
  - Protected resource metadata (RFC 9728) at `/.well-known/oauth-protected-resource` or the path-suffixed variant. Its `resource` must equal `server_url` or that URL's origin. Its `authorization_servers` must name your issuer.
  - Authorization server metadata (RFC 8414 or OpenID Connect discovery). Its `issuer` must equal the issuer it was fetched for.
  - PKCE with `S256` listed in `code_challenge_methods_supported`.
  - Resource indicators (RFC 8707). Accept the `resource` parameter and issue tokens bound to your server.
  - Authorization and token endpoints on `https` only.
  - Dynamic Client Registration for public clients (`token_endpoint_auth_method: none`). Without it, the plugin can only be listed: say so in the PR so Macch can pre-register a client with you.
  - Metadata and token URLs answer directly, without redirects.
- `api_key`: the admin or operator pastes a key in Macch Admin. Macch sends it as `Authorization: Bearer <key>` on every request. Validate it on every request.
- `none`: only for public, non-personal data such as documentation search. Never use it for company or customer data.

## Verification checklist

- [ ] `npm run validate` and `npm test` pass in this repo.
- [ ] The template's tests pass for your server.
- [ ] `server_url` answers MCP `initialize` and `tools/list` over public `https` from outside your network.
- [ ] Every tool in the manifest exists on the server with the same name.
- [ ] Each `read_only` value matches the tool's `readOnlyHint` and its real behavior.
- [ ] For `oauth`, the full sign-in completes against the deployed server, and metadata passes the rules in [Auth](#auth).
- [ ] No result or error contains a secret.
- [ ] `summary` and every `suggestions` text have `en-US`, `es-AR`, and `pt-BR`.

## Pull request

- Add or change exactly one file: `plugins/<slug>.json`. Server code lives in your own repo.
- Fill in [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md). For each tool, give one line on what it does and why its `read_only` value is right.
- Explain how Macch can test the plugin, such as a sandbox account. Never put credentials in the PR. Macch will contact you for them.
- Leave `listed`, `staff_only`, and `review` unset.
- To change a listed plugin, open a PR that describes what changed on the server and why.
