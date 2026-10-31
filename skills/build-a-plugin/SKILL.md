---
name: build-a-plugin
description: Build, deploy, and submit a Macch agent plugin (a remote MCP server plus a manifest PR to macch-ai/macch-plugins). Use when asked to connect a system to Macch, build a Macch plugin, or add a plugin manifest to this repo.
---

# Build a Macch plugin

Runbook. The full contract is in [`AGENTS.md`](../../AGENTS.md). Read it before step 6.

1. **Scope the jobs.** List 3 to 10 operator jobs. One tool per job.
2. **Copy a template** into a new repo outside this one: [`templates/python/`](../../templates/python/) or [`templates/typescript/`](../../templates/typescript/). Follow its README.
3. **Write the tools.**
   - English descriptions written for a model: what, when, returns.
   - Set `readOnlyHint: true` only for tools that change nothing.
   - Return short structured results with only the fields an operator needs.
   - Return `isError: true` with an English next action on failure.
   - Never return secrets.
4. **Pick auth.**
   - `connection`: `operator` when users have their own accounts, `company` for one shared account.
   - `auth`: `oauth` when the system has sign-in (MCP authorization spec: RFC 9728, RFC 8414, PKCE S256, RFC 8707, https only). `api_key` arrives as `Authorization: Bearer <key>`. `none` only for public data.
5. **Test and deploy.** Run the template's tests. Deploy on public `https`. Call `tools/list` from outside your network.
6. **Write `plugins/<slug>.json`.**
   - `slug` matches the file name, uses lowercase words joined by hyphens, has at most 40 characters, and is not `tickets`, `customers`, `hub`, `memory`, or `tool`.
   - Required: `slug`, `name`, `summary` (`en-US` plus `es-AR` and `pt-BR`), `publisher`, `server_url`, `connection`, `auth`.
   - List every tool under `tools` with `read_only` matching its `readOnlyHint`. Unlisted tools stay hidden.
   - Do not set `listed` or `review`. No other keys.
7. **Validate.** Run `npm install && npm run validate && npm test` at the repo root.
8. **Open the PR.** Change only that one file. Fill in the PR template with one line per tool justifying `read_only`. Explain how Macch can test. Never include credentials.

## Stop conditions

- The system has no public `https` endpoint: deploy one first, or use it as a private plugin. A private plugin needs no PR; an admin pastes the URL in Macch Admin.
- A tool's behavior is unclear, or it writes data: set `read_only: false`.
- A shipped tool must change: add a new tool name instead. Macch hides any reviewed tool whose description, schema, annotations, or `_meta` changed until it reviews the tool again.
