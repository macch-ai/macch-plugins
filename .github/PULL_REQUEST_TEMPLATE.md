## Plugin

<!-- One plugin per pull request. -->

- Manifest: `plugins/<slug>.json`
- Server docs:

## Tools

<!-- One line per tool in "tools". Say why each read_only: true tool only reads, and what each read_only: false tool changes. -->

| Tool | read_only | Why |
| --- | --- | --- |
| | | |

## Checklist

- [ ] The manifest is at `plugins/<slug>.json`, and `slug` equals the file name.
- [ ] `npm run validate` passes.
- [ ] `server_url` is a public https Streamable HTTP MCP endpoint that answers `initialize` and `tools/list`.
- [ ] Sign-in works with the declared `auth` (OAuth flow completes, or the API key is accepted as `Authorization: Bearer <key>`).
- [ ] Every tool marked `read_only: true` only reads data, and the table above explains each `read_only` value.
- [ ] `summary` has `en-US`, `es-AR`, and `pt-BR` texts that say what operators can do, not how it works.
- [ ] Any `suggestions` are questions an operator would really ask, answerable with the listed tools, with `en-US`, `es-AR`, and `pt-BR` texts.
- [ ] I will not change tool names, descriptions, input schemas, annotations, or `_meta` without expecting a new review (changed tools are hidden until Macch reviews them again).
