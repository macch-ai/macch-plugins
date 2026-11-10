# Contributing

Each pull request adds or changes one plugin manifest in `plugins/`. Server code lives in your own repo. Follow [`AGENTS.md`](AGENTS.md) to build the server and write the manifest.

## Before you open a PR

```sh
npm install
npm run validate
npm test
```

CI runs the same checks. A PR with failing checks is not reviewed.

## What Macch checks

- **Manifest.** It passes the schema. `slug` equals the file name. The summary is short, describes user value, and has `en-US`, `es-AR`, and `pt-BR`. Suggestions, if any, are questions an operator would really ask and match the plugin's tools.
- **Reachability.** `server_url` serves MCP over Streamable HTTP on public `https`.
- **Every tool.** Macch calls `tools/list` and reads each listed tool's description, input schema, annotations, and `_meta`.
  - The description is clear to a model and matches what the tool does.
  - Nothing in the definition tries to steer the agent beyond the tool's own job.
  - The tool exists on the server under the listed name.
- **`read_only` claims.** A tool marked `read_only: true` runs without asking the operator, so Macch verifies it changes nothing. It must also have `readOnlyHint: true`. When in doubt, Macch asks you to set `false`.
- **Auth.** OAuth discovery and sign-in work end to end against the deployed server. Scopes are the smallest set the tools need. API-key servers reject requests with a missing or wrong key.
- **Results.** Results are short and scoped to the authenticated account. They contain no secrets.

Macch may ask for a sandbox account to test with. Share credentials only when Macch asks, and never in the PR.

## After merge

Macch merges the PR and the plugin appears in the Marketplace in Macch Admin. Each company decides whether to turn it on.

Macch fingerprints each reviewed tool. If a tool's description, input schema, annotations, or `_meta` changes on your server, Macch hides that tool until it reviews it again. To change a listed plugin, open a PR that says what changed and why. Macch then re-reviews the tools and updates `review` when needed.

Macch may set `listed: false` to hide a plugin, for example when its server stops working or breaks these rules.
