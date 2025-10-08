"""Lightweight Pterodactyl automation helper for Alexandrian Tools Shop.

This module uses the official Pterodactyl API to provision servers after
successful purchases. It is intentionally simple so it can be extended to fit
production workflows.
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

import aiohttp
from dotenv import load_dotenv

load_dotenv()

PTERODACTYL_API_KEY = os.getenv("PTERODACTYL_API_KEY")
PTERODACTYL_PANEL_URL = os.getenv("PTERODACTYL_PANEL_URL", "https://panel.example.com")
DEFAULT_EGG_ID = os.getenv("PTERODACTYL_DEFAULT_EGG", "1")
DEFAULT_LOCATION_ID = os.getenv("PTERODACTYL_DEFAULT_LOCATION", "1")


@dataclass
class ServerRequest:
    name: str
    user_id: int
    description: str = "Provisioned via Alexandrian Tools Shop"
    egg_id: str = DEFAULT_EGG_ID
    location_id: str = DEFAULT_LOCATION_ID
    memory: int = 1024
    disk: int = 10240
    cpu: int = 100


class PterodactylClient:
    def __init__(self, base_url: str, api_key: str) -> None:
        if not api_key:
            raise RuntimeError("PTERODACTYL_API_KEY is required")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.session: Optional[aiohttp.ClientSession] = None

    async def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        if self.session is None:
            self.session = aiohttp.ClientSession()
        headers = kwargs.setdefault("headers", {})
        headers.update(
            {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )
        async with self.session.request(method, f"{self.base_url}{endpoint}", **kwargs) as response:
            response.raise_for_status()
            return await response.json()

    async def list_servers(self) -> Dict[str, Any]:
        return await self._request("GET", "/api/application/servers")

    async def create_server(self, payload: ServerRequest) -> Dict[str, Any]:
        data = {
            "name": payload.name,
            "user": payload.user_id,
            "description": payload.description,
            "egg": payload.egg_id,
            "docker_image": "ghcr.io/pterodactyl/yolks:python_3.11",
            "startup": "python main.py",
            "limits": {"memory": payload.memory, "swap": 0, "disk": payload.disk, "io": 500, "cpu": payload.cpu},
            "feature_limits": {"databases": 5, "backups": 5, "allocations": 2},
            "environment": {"PYTHON_VERSION": "3.11"},
            "allocation": {"default": payload.location_id},
        }
        return await self._request("POST", "/api/application/servers", json=data)

    async def close(self) -> None:
        if self.session:
            await self.session.close()
            self.session = None


async def demo() -> None:
    client = PterodactylClient(PTERODACTYL_PANEL_URL, PTERODACTYL_API_KEY or "")
    servers = await client.list_servers()
    print("Existing servers:")
    for item in servers.get("data", []):
        attributes = item.get("attributes", {})
        print(f"- #{attributes.get('id')} {attributes.get('name')} :: {attributes.get('status')}")
    await client.close()


if __name__ == "__main__":
    asyncio.run(demo())
