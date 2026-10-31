/** End-to-end checks: the server speaks MCP over HTTP the way Macch's agent calls it. */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startServer } from "../src/server.js";

const API_KEY = "test-key";

let httpServer: Server;
let mcpUrl: URL;
let client: Client;

/** Parses the JSON text a tool returns. */
function toolJson(result: Awaited<ReturnType<Client["callTool"]>>): any {
  const [first] = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(first.text);
}

beforeAll(async () => {
  httpServer = await startServer({ apiKey: API_KEY, port: 0, host: "127.0.0.1" });
  const { port } = httpServer.address() as AddressInfo;
  mcpUrl = new URL(`http://127.0.0.1:${port}/mcp`);

  client = new Client({ name: "template-test", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(mcpUrl, { requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } } }),
  );
});

afterAll(async () => {
  await client?.close();
  await new Promise((resolve) => httpServer?.close(resolve));
});

describe("MCP server", () => {
  it("lists one read-only tool and one changing tool", async () => {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

    expect(Object.keys(byName).sort()).toEqual(["add_work_order_note", "search_work_orders"]);
    expect(byName.search_work_orders.annotations?.readOnlyHint).toBe(true);
    expect(byName.add_work_order_note.annotations?.readOnlyHint).toBe(false);
    expect(byName.search_work_orders.inputSchema.required).toEqual(["query"]);
  });

  it("searches work orders", async () => {
    const result = await client.callTool({ name: "search_work_orders", arguments: { query: "jane" } });

    expect(result.isError).toBeFalsy();
    expect(toolJson(result).work_orders.map((order: { id: string }) => order.id)).toEqual(["WO-1001"]);
  });

  it("adds a note and keeps it for later calls", async () => {
    const result = await client.callTool({
      name: "add_work_order_note",
      arguments: { work_order_id: "WO-1002", note: "Call before arriving." },
    });
    const search = await client.callTool({ name: "search_work_orders", arguments: { query: "WO-1002" } });

    expect(result.isError).toBeFalsy();
    expect(toolJson(search).work_orders[0].notes).toEqual(["Call before arriving."]);
  });

  it("returns a tool error that tells the agent what to do next", async () => {
    const result = await client.callTool({
      name: "add_work_order_note",
      arguments: { work_order_id: "WO-9999", note: "Hello." },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("search_work_orders");
  });

  it("rejects requests without the API key", async () => {
    const response = await fetch(mcpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("rejects requests with a wrong API key", async () => {
    const response = await fetch(mcpUrl, {
      method: "POST",
      headers: { Authorization: "Bearer wrong-key", "Content-Type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(401);
  });
});
