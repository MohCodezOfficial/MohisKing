"""Discord bot for Alexandrian Tools Shop.

The bot authenticates against the backend API using the owner credentials
and exposes slash commands to manage products without opening the admin UI.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

import aiohttp
from discord import Intents
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()

API_BASE = os.getenv("ATS_API_BASE", "http://localhost:4000")
OWNER_USERNAME = os.getenv("ATS_OWNER_USERNAME", "owner")
OWNER_PASSWORD = os.getenv("ATS_OWNER_PASSWORD", "AdminPass123!")
DISCORD_TOKEN = os.getenv("ATS_DISCORD_TOKEN")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("alexandrian.bot")


class APIClient:
    def __init__(self, base_url: str, session: Optional[aiohttp.ClientSession] = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = session or aiohttp.ClientSession()
        self.cookie_jar: Optional[str] = None

    async def close(self) -> None:
        await self.session.close()

    async def _request(self, method: str, path: str, **kwargs):
        headers = kwargs.setdefault("headers", {})
        headers.setdefault("Content-Type", "application/json")
        if self.cookie_jar:
            headers["Cookie"] = self.cookie_jar

        async with self.session.request(method, f"{self.base_url}{path}", **kwargs) as resp:
            if resp.status >= 400:
                text = await resp.text()
                raise RuntimeError(f"API error {resp.status}: {text}")
            cookies = resp.headers.getall("Set-Cookie", [])
            if cookies:
                self.cookie_jar = "; ".join(cookies)
            if resp.content_type == "application/json":
                return await resp.json()
            return await resp.text()

    async def login(self, username: str, password: str) -> None:
        await self._request(
            "POST",
            "/api/auth/login",
            json={"username": username, "password": password},
        )

    async def list_products(self):
        return await self._request("GET", "/api/products")

    async def add_product(self, name: str, description: str, price: float, image_url: str = ""):
        return await self._request(
            "POST",
            "/api/products",
            json={
                "name": name,
                "description": description,
                "price": price,
                "imageUrl": image_url,
            },
        )

    async def remove_product(self, product_id: int):
        return await self._request("DELETE", f"/api/products/{product_id}")


class AlexandrianBot(commands.Bot):
    def __init__(self, api_client: APIClient) -> None:
        intents = Intents.default()
        super().__init__(command_prefix="!", intents=intents)
        self.api = api_client

    async def setup_hook(self) -> None:
        await self.api.login(OWNER_USERNAME, OWNER_PASSWORD)
        logger.info("Authenticated against Alexandrian Tools backend.")

    async def close(self) -> None:
        await self.api.close()
        await super().close()


bot = AlexandrianBot(APIClient(API_BASE))


@bot.command(name="addproduct")
async def add_product(ctx: commands.Context, price: float, name: str, *, description: str = "", image_url: str = ""):
    """Add a product to the shop from Discord.

    Example:
      !addproduct 19.99 "Proxy Bundle" description="Residential proxies" image_url="https://..."
    """

    try:
        product = await bot.api.add_product(name=name, description=description, price=price, image_url=image_url)
        await ctx.send(f"✅ Product `{product['name']}` deployed to storefront.")
    except Exception as exc:  # noqa: BLE001 - surfaced to Discord
        logger.exception("Failed to add product")
        await ctx.send(f"⚠️ Unable to deploy product: {exc}")


@bot.command(name="removeproduct")
async def remove_product(ctx: commands.Context, product_id: int):
    """Remove a product by ID."""

    try:
        await bot.api.remove_product(product_id)
        await ctx.send(f"🗑️ Product `{product_id}` has been purged.")
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to remove product")
        await ctx.send(f"⚠️ Unable to purge product: {exc}")


@bot.command(name="listproducts")
async def list_products(ctx: commands.Context):
    """List all products currently available."""

    try:
        products = await bot.api.list_products()
        if not products:
            await ctx.send("No products deployed yet.")
            return
        lines = [f"#{item['id']} • {item['name']} (${item['price']:.2f})" for item in products]
        await ctx.send("\n".join(lines))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to list products")
        await ctx.send(f"⚠️ Unable to list products: {exc}")


async def main() -> None:
    if not DISCORD_TOKEN:
        raise RuntimeError("ATS_DISCORD_TOKEN environment variable is required.")
    async with bot:
        await bot.start(DISCORD_TOKEN)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Bot shutting down")
