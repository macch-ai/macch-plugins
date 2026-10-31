"""Example Macch plugin: an MCP server that lets Macch's agent read and update work orders.

Replace the in-memory `WORK_ORDERS` store with calls to your own system. Keep each tool's
name, description, and input schema stable once Macch lists it: a changed tool is hidden
from the agent until Macch reviews it again.
"""

import logging
import os
import secrets
from datetime import UTC, datetime
from typing import Annotated, Literal

import uvicorn
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

API_KEY_ENV = "PLUGIN_API_KEY"
MCP_PATH = "/mcp"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000
SEARCH_LIMIT_MAX = 50

logger = logging.getLogger(__name__)

WorkOrderStatus = Literal["open", "scheduled", "done"]


class WorkOrder(BaseModel):
    """A field visit for one customer, as the agent sees it."""

    id: str
    customer: str
    address: str
    status: WorkOrderStatus
    notes: list[str]


class WorkOrderList(BaseModel):
    """Work orders matching a search."""

    work_orders: list[WorkOrder]


# NOTE: sample data so the template runs without a backend. Swap for your system's API.
WORK_ORDERS: dict[str, WorkOrder] = {
    "WO-1001": WorkOrder(
        id="WO-1001",
        customer="Jane Doe",
        address="742 Evergreen Terrace",
        status="open",
        notes=["No signal since Monday."],
    ),
    "WO-1002": WorkOrder(
        id="WO-1002",
        customer="John Roe",
        address="31 Spooner Street",
        status="scheduled",
        notes=[],
    ),
}

mcp = MCPServer("Example work orders", version="0.1.0")


@mcp.tool(
    annotations=ToolAnnotations(title="Find work orders", read_only_hint=True, open_world_hint=False),
)
def find_work_orders(
    query: Annotated[str, Field(description="Customer name, address, or work order ID. Partial text matches.")],
    status: Annotated[WorkOrderStatus | None, Field(description="Only return orders in this status.")] = None,
    limit: Annotated[int, Field(ge=1, le=SEARCH_LIMIT_MAX, description="Maximum orders to return.")] = 10,
) -> WorkOrderList:
    """Find field work orders for a customer to check their status and visit notes.

    Returns matching orders with ID, customer, address, status, and notes. An empty list
    means no order matches; try a shorter query before telling the operator none exist.
    """
    needle = query.strip().lower()
    matches = [
        order
        for order in WORK_ORDERS.values()
        if needle in f"{order.id} {order.customer} {order.address}".lower()
        and (status is None or order.status == status)
    ]
    return WorkOrderList(work_orders=matches[:limit])


@mcp.tool(
    annotations=ToolAnnotations(
        title="Add work order note",
        read_only_hint=False,
        destructive_hint=False,
        idempotent_hint=False,
        open_world_hint=False,
    ),
)
def add_work_order_note(
    work_order_id: Annotated[str, Field(description="Work order ID from find_work_orders, e.g. WO-1001.")],
    note: Annotated[
        str, Field(min_length=1, max_length=1000, description="Text the field technician will read on site.")
    ],
) -> WorkOrder:
    """Add a note to a work order so the field technician sees it before the visit.

    Appends the note without changing existing notes. Returns the updated work order.
    """
    order = WORK_ORDERS.get(work_order_id)
    if order is None:
        # ToolError text reaches the model, so it names the next step instead of internals.
        raise ToolError(f"Work order {work_order_id} not found. Call find_work_orders to get a valid ID.")
    stamped = f"{datetime.now(UTC):%Y-%m-%d %H:%M} UTC: {note.strip()}"
    order.notes.append(stamped)
    logger.info("Added note to work order %s", work_order_id)
    return order


class BearerKeyMiddleware:
    """Reject HTTP requests whose `Authorization: Bearer <key>` does not match the plugin API key.

    Matches the manifest's `"auth": "api_key"`: an admin pastes the key in Macch once and
    Macch sends it on every request. To use OAuth instead (`"auth": "oauth"`), drop this
    middleware and pass `token_verifier=` and `auth=AuthSettings(...)` to `MCPServer`, which
    serves the RFC 9728 protected-resource metadata and answers 401 with its location.
    """

    def __init__(self, app: ASGIApp, api_key: str) -> None:
        self.app = app
        self.expected = f"Bearer {api_key}".encode()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        provided = dict(scope["headers"]).get(b"authorization", b"")
        # Constant-time comparison so response timing does not leak the key.
        if not secrets.compare_digest(provided, self.expected):
            response = JSONResponse(
                {"error": "invalid_token", "error_description": "Missing or invalid API key."},
                status_code=401,
                headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


def create_app() -> Starlette:
    """Build the HTTPS-ready ASGI app that serves the MCP endpoint at `/mcp`.

    Stateless JSON responses keep every request self-contained, so the app runs on
    serverless platforms and behind load balancers without sticky sessions.
    """
    api_key = os.environ.get(API_KEY_ENV, "")
    if not api_key:
        raise RuntimeError(f"Set {API_KEY_ENV} to the API key Macch will send as a bearer token.")
    app = mcp.streamable_http_app(
        streamable_http_path=MCP_PATH,
        stateless_http=True,
        json_response=True,
        # DNS-rebinding protection guards unauthenticated servers on localhost. This server
        # is reached through a public hostname and authenticates every request instead.
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    app.add_middleware(BearerKeyMiddleware, api_key=api_key)
    return app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(
        create_app(),
        host=os.environ.get("HOST", DEFAULT_HOST),
        port=int(os.environ.get("PORT", DEFAULT_PORT)),
    )
