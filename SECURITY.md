# Security

## Reporting a vulnerability

Email **security@macch.ai** with steps to reproduce and the affected plugin or file. Do not open a public issue. We coordinate disclosure with you.

This covers this repository and the plugin flow inside Macch. For a vulnerability in a third-party plugin's server, also contact that plugin's publisher.

## Plugin security expectations

Every plugin must meet these rules. Macch checks them in review and may unlist a plugin that breaks them.

- **Public `https` only.** `server_url`, OAuth endpoints, and `docs_url` use `https`. Macch refuses private, loopback, and cloud metadata addresses at runtime.
- **Least privilege.** Request the smallest OAuth scopes the tools need. Prefer per-operator sign-in (`connection: operator`) when the system has per-user permissions.
- **Scoped access.** Each call acts only on data the authenticated account may access.
- **No secrets in results.** Tool results and errors never contain tokens, API keys, passwords, or internal URLs.
- **No secrets in this repo.** Manifests and PRs never contain credentials. Macch stores OAuth clients and keys outside the repo.
- **Honest tool definitions.** `read_only: true` and `readOnlyHint: true` only for tools that change nothing. Descriptions describe the tool and never instruct the agent to do anything else.
- **Validate every request.** API-key and OAuth servers reject requests with a missing, wrong, or expired credential. OAuth servers only accept tokens issued for their own resource (RFC 8707).
