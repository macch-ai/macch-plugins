"""End-to-end checks that drive the plugin through a real MCP client over Streamable HTTP."""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import httpx2
import pytest
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

import server

API_KEY = "test-key"
BASE_URL = "https://plugin.test"
MCP_URL = f"{BASE_URL}{server.MCP_PATH}"
MANIFEST_PATH = Path(__file__).parent.parent / "plugin.example.json"


@pytest.fixture
def anyio_backend() -> str:
    """Run async tests on asyncio, the loop uvicorn uses in production."""
    return "asyncio"


@pytest.fixture
async def http(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[httpx2.AsyncClient]:
    """An HTTP client wired to the app in-process, with the app's lifespan running."""
    monkeypatch.setenv(server.API_KEY_ENV, API_KEY)
    app = server.create_app()
    async with app.router.lifespan_context(app):
        async with httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url=BASE_URL) as client:
            yield client


@asynccontextmanager
async def mcp_client(http: httpx2.AsyncClient, mode: str = "auto") -> AsyncIterator[Client]:
    """A connected MCP client that authenticates the way Macch does."""
    http.headers["Authorization"] = f"Bearer {API_KEY}"
    async with Client(streamable_http_client(MCP_URL, http_client=http), mode=mode) as client:
        yield client


@pytest.mark.anyio
@pytest.mark.parametrize("mode", ["auto", "legacy"])
async def test_lists_tools_with_their_annotations(http: httpx2.AsyncClient, mode: str) -> None:
    """Clients on the current and the handshake-era protocol see both tools; only the lookup is read-only."""
    async with mcp_client(http, mode) as client:
        tools = {tool.name: tool for tool in (await client.list_tools()).tools}

    assert set(tools) == {"find_work_orders", "add_work_order_note"}
    assert tools["find_work_orders"].annotations.read_only_hint is True
    assert tools["add_work_order_note"].annotations.read_only_hint is False


@pytest.mark.anyio
async def test_finds_work_orders_by_customer(http: httpx2.AsyncClient) -> None:
    """A partial customer name returns that customer's order."""
    async with mcp_client(http) as client:
        result = await client.call_tool("find_work_orders", {"query": "jane"})

    assert not result.is_error
    assert [order["id"] for order in result.structured_content["work_orders"]] == ["WO-1001"]


@pytest.mark.anyio
async def test_adds_a_note_to_a_work_order(http: httpx2.AsyncClient) -> None:
    """The note is appended and the updated order is returned."""
    async with mcp_client(http) as client:
        result = await client.call_tool("add_work_order_note", {"work_order_id": "WO-1002", "note": "Ring twice."})

    assert not result.is_error
    assert result.structured_content["notes"][-1].endswith("Ring twice.")


@pytest.mark.anyio
async def test_unknown_work_order_tells_the_agent_what_to_do(http: httpx2.AsyncClient) -> None:
    """A bad ID is a tool error that points the agent to the lookup tool."""
    async with mcp_client(http) as client:
        result = await client.call_tool("add_work_order_note", {"work_order_id": "WO-9", "note": "Hi."})

    assert result.is_error
    assert "find_work_orders" in result.content[0].text


@pytest.mark.anyio
@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer wrong-key"}])
async def test_rejects_missing_or_wrong_api_key(http: httpx2.AsyncClient, headers: dict[str, str]) -> None:
    """Requests without the right bearer key never reach the MCP endpoint."""
    response = await http.post(
        server.MCP_PATH,
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        headers={"Accept": "application/json, text/event-stream", **headers},
    )

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"].startswith("Bearer")


def test_create_app_requires_an_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """The server refuses to start open to the internet."""
    monkeypatch.delenv(server.API_KEY_ENV, raising=False)

    with pytest.raises(RuntimeError):
        server.create_app()


@pytest.mark.anyio
async def test_manifest_lists_every_tool_with_matching_read_only_flag(http: httpx2.AsyncClient) -> None:
    """The manifest example stays in sync with the server: same tools, same read-only flags."""
    manifest = json.loads(MANIFEST_PATH.read_text())
    async with mcp_client(http) as client:
        tools = (await client.list_tools()).tools

    assert manifest["tools"] == {tool.name: {"read_only": bool(tool.annotations.read_only_hint)} for tool in tools}
