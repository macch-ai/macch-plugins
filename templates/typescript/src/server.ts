/**
 * Remote MCP server template for a Macch plugin.
 *
 * Macch's agent connects to this server over Streamable HTTP, lists its tools,
 * and calls them on behalf of ISP operators. The example domain is a field
 * work-order system: replace the in-memory store with calls to your own API.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const SERVER_NAME = "example-workorders";
const SERVER_VERSION = "0.1.0";
const MCP_PATH = "/mcp";
const HEALTH_PATH = "/healthz";
const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";
const SEARCH_RESULT_LIMIT = 20;

/** A field visit scheduled for a customer. */
export interface WorkOrder {
  id: string;
  customer: string;
  address: string;
  status: "open" | "scheduled" | "done";
  notes: string[];
}

/** Sample data so the template runs end to end. Replace with your system's API. */
function sampleWorkOrders(): Map<string, WorkOrder> {
  const orders: WorkOrder[] = [
    { id: "WO-1001", customer: "Jane Doe", address: "742 Evergreen Terrace", status: "open", notes: [] },
    { id: "WO-1002", customer: "John Roe", address: "31 Spooner Street", status: "scheduled", notes: [] },
  ];
  return new Map(orders.map((order) => [order.id, order]));
}

/**
 * Builds the MCP server and its tools.
 *
 * Tool names, descriptions, input schemas, and annotations are what Macch
 * reviews. Changing any of them hides the tool until Macch reviews it again,
 * so keep them stable once published.
 */
export function createMcpServer(workOrders: Map<string, WorkOrder> = sampleWorkOrders()): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "search_work_orders",
    {
      title: "Search work orders",
      description:
        "Find field work orders by customer name, address, or work order id. " +
        "Use it before adding a note, to get the exact work order id. " +
        `Returns up to ${SEARCH_RESULT_LIMIT} matches with id, customer, address, status, and notes.`,
      inputSchema: {
        query: z.string().trim().min(2).describe("Customer name, street address, or work order id."),
        status: z.enum(["open", "scheduled", "done"]).optional().describe("Only return work orders in this status."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, status }) => {
      const needle = query.toLowerCase();
      const matches = [...workOrders.values()]
        .filter((order) => !status || order.status === status)
        .filter((order) =>
          [order.id, order.customer, order.address].some((field) => field.toLowerCase().includes(needle)),
        )
        .slice(0, SEARCH_RESULT_LIMIT);
      return { content: [{ type: "text", text: JSON.stringify({ work_orders: matches }) }] };
    },
  );

  server.registerTool(
    "add_work_order_note",
    {
      title: "Add work order note",
      description:
        "Add a note to a field work order so the technician sees it before the visit. " +
        "Needs the exact work order id from search_work_orders. Returns the updated work order.",
      inputSchema: {
        work_order_id: z.string().trim().min(1).describe("Exact work order id, for example WO-1001."),
        note: z.string().trim().min(1).max(1000).describe("Note for the technician, in plain language."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ work_order_id, note }) => {
      const order = workOrders.get(work_order_id);
      if (!order) {
        // Tool errors go back to the model: say what failed and what to do next.
        return {
          isError: true,
          content: [{ type: "text", text: "Work order not found. Call search_work_orders to get the exact id." }],
        };
      }
      order.notes.push(note);
      return { content: [{ type: "text", text: JSON.stringify({ work_order: order }) }] };
    },
  );

  return server;
}

/** Compares secrets in constant time; hashing first equalizes lengths. */
function secretsMatch(received: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}

/**
 * Checks `Authorization: Bearer <key>`, the header Macch sends for `"auth": "api_key"` plugins.
 *
 * For `"auth": "oauth"`, validate an access token issued for this server instead,
 * and publish RFC 9728 protected-resource metadata so Macch can find your
 * authorization server (see README).
 */
function isAuthorized(req: IncomingMessage, apiKey: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "");
  return match !== null && secretsMatch(match[1].trim(), apiKey);
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": "application/json", ...headers }).end(JSON.stringify(body));
}

/**
 * Handles one MCP request statelessly: a fresh server and transport per request,
 * so any number of instances can run behind a load balancer without sticky sessions.
 */
async function handleMcpRequest(req: IncomingMessage, res: ServerResponse, workOrders: Map<string, WorkOrder>) {
  const server = createMcpServer(workOrders);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

export interface StartOptions {
  apiKey: string;
  port?: number;
  host?: string;
}

/** Starts the HTTP server. Resolves once it is listening; port 0 picks a free port. */
export async function startServer({ apiKey, port = DEFAULT_PORT, host = DEFAULT_HOST }: StartOptions): Promise<Server> {
  if (!apiKey) throw new Error("An API key is required.");
  const workOrders = sampleWorkOrders();

  const httpServer = createHttpServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    try {
      if (path === HEALTH_PATH && req.method === "GET") {
        return sendJson(res, 200, { status: "ok" });
      }
      if (path !== MCP_PATH) {
        return sendJson(res, 404, { error: "Not found." });
      }
      if (!isAuthorized(req, apiKey)) {
        return sendJson(res, 401, { error: "Missing or invalid API key." }, { "WWW-Authenticate": "Bearer" });
      }
      // Stateless servers have no session stream to open (GET) or end (DELETE).
      if (req.method !== "POST") {
        return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
      }
      await handleMcpRequest(req, res, workOrders);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!res.headersSent) {
        sendJson(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error." }, id: null });
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => resolve());
  });
  return httpServer;
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const apiKey = process.env.PLUGIN_API_KEY;
  if (!apiKey) {
    console.error("PLUGIN_API_KEY is not set. Set it to the key Macch will send as a Bearer token.");
    process.exit(1);
  }
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const host = process.env.HOST ?? DEFAULT_HOST;
  const httpServer = await startServer({ apiKey, port, host });
  console.log(`MCP server listening on http://${host}:${port}${MCP_PATH}`);

  const shutdown = () => httpServer.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
