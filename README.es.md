[Read in English](README.md)

# Macch Plugins

El catálogo público de plugins de terceros para el agente de Macch, el agente de IA con el que chatean los operadores de ISP dentro de Macch Admin. Un plugin es un servidor [MCP](https://modelcontextprotocol.io) remoto (Streamable HTTP) que le da al agente nuevas herramientas: buscar un pago, leer un documento, abrir una orden en tu sistema. Cada plugin es un archivo de manifest en [`plugins/`](plugins/). Macch revisa cada herramienta antes de que un plugin aparezca en el Marketplace dentro de Macch Admin.

## Conectá tu sistema con un solo prompt

Dale este prompt a tu agente de programación:

```text
Read github.com/macch-ai/macch-plugins and its AGENTS.md. Build an MCP server
for <my system> from the template that fits, deploy it, and open a PR adding
its manifest.
```

[`AGENTS.md`](AGENTS.md) (en inglés) tiene el flujo de trabajo y el contrato completos. Los agentes que cargan skills también pueden usar [`skills/build-a-plugin/SKILL.md`](skills/build-a-plugin/SKILL.md) (en inglés).

## Cómo se publica un plugin

1. Desplegás un servidor MCP en una URL pública `https`.
2. Abrís un pull request que agrega `plugins/<slug>.json`.
3. Macch revisa cada herramienta, incluida su declaración `read_only`. Mirá [`CONTRIBUTING.md`](CONTRIBUTING.md) (en inglés).
4. Macch hace merge del PR. El plugin aparece en el Marketplace, y cada empresa decide si lo activa.

## Plugins privados

Para usar un servidor solo dentro de tu empresa, un administrador pega su URL MCP en Macch Admin. No hace falta un pull request. Los mismos templates sirven para plugins privados.

## El manifest de un vistazo

| Campo | Obligatorio | Valor |
| --- | --- | --- |
| `slug` | sí | Palabras en minúscula unidas por guiones, máximo 40 caracteres, igual al nombre del archivo. |
| `name` | sí | Nombre visible. |
| `summary` | sí | Una oración corta por locale. `en-US` es obligatorio; agregá `es-AR` y `pt-BR`. |
| `publisher` | sí | Quién opera el servidor. |
| `server_url` | sí | URL `https` del endpoint MCP Streamable HTTP. |
| `connection` | sí | `operator` (cada operador inicia sesión) o `company` (una cuenta compartida). |
| `auth` | sí | `oauth`, `api_key` o `none`. |
| `oauth` | no | `{ "scopes": "space separated scopes" }`. |
| `docs_url` | no | Link `https` a tu documentación. |
| `tools` | no | `{ "<tool name>": { "read_only": true } }`. Solo las herramientas listadas llegan al agente. |
| `suggestions` | no | Hasta tres primeras preguntas que se muestran en un chat vacío cuando un operador ya puede usar el plugin. |
| `listed` | no | Lo define Macch. Por defecto `true`. |
| `review` | no | Lo define Macch. Por defecto `1`. |

Reglas completas: [`AGENTS.md`](AGENTS.md#the-manifest) (en inglés). JSON Schema: [`schema/plugin.schema.json`](schema/plugin.schema.json). Ejemplos: [`plugins/`](plugins/).

## Templates

- [`templates/python/`](templates/python/): SDK oficial de MCP para Python, Streamable HTTP, pytest.
- [`templates/typescript/`](templates/typescript/): `@modelcontextprotocol/sdk` oficial, Streamable HTTP.

El README de cada template tiene los pasos para ejecutarlo, testearlo y desplegarlo.

## Validar

Requiere Node.js 22 o posterior.

```sh
npm install
npm run validate   # check every manifest in plugins/
npm test
```

CI corre los mismos chequeos en cada pull request.

## Licencia

[MIT](LICENSE). Reportá problemas de seguridad como se describe en [`SECURITY.md`](SECURITY.md) (en inglés).
