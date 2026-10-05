"""Direct Albert Heijn API client."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlencode

import aiohttp

from .const import AH_BASE_URL, CLIENT_ID, USER_AGENT
from .helpers import (
    build_bonusbox_section,
    get_bonus_monday,
    normalize_member,
    parse_bonus_offers,
)

_LOGGER = logging.getLogger(__name__)

FETCH_MEMBER_QUERY = """query FetchMember {
  member {
    id
    emailAddress
    memberships
    name { first last }
    address { street houseNumber postalCode city countryCode }
    cards { airmiles bonus gall }
  }
}"""

PURCHASE_STAMP_BALANCE_QUERY = """{
  purchaseStampBalance {
    points { currentBookletPoints fullBooklets totalPoints }
    money { invested { amount } interest { amount } payout { amount } }
    constants { price { amount } }
  }
}"""


class AHApiError(Exception):
    """AH API error."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class AHClient:
    """Talks directly to api.ah.nl."""

    def __init__(self, session: aiohttp.ClientSession) -> None:
        self._session = session

    async def _request(
        self,
        method: str,
        path: str,
        *,
        access_token: str | None = None,
        json_body: dict[str, Any] | None = None,
        form_body: str | None = None,
        params: dict[str, Any] | None = None,
        content_type: str = "application/json",
    ) -> Any:
        headers = {
            "User-Agent": USER_AGENT,
            "Content-Type": content_type,
        }
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        if "x-application" not in headers:
            headers["x-application"] = "AHWEBSHOP"

        url = f"{AH_BASE_URL}{path}"
        async with self._session.request(
            method,
            url,
            headers=headers,
            json=json_body,
            data=form_body,
            params=params,
            timeout=aiohttp.ClientTimeout(total=60),
        ) as response:
            if "json" in (response.content_type or ""):
                data = await response.json()
            else:
                text = await response.text()
                data = {"raw": text} if text else None

            if response.status >= 400:
                message = "AH API fout"
                if isinstance(data, dict):
                    message = (
                        data.get("message")
                        or data.get("error_description")
                        or data.get("error")
                        or message
                    )
                raise AHApiError(f"{message} ({response.status})", response.status)

            return data

    def _normalize_tokens(self, data: dict[str, Any]) -> dict[str, Any]:
        access = data.get("access_token") or data.get("accessToken") or ""
        refresh = data.get("refresh_token") or data.get("refreshToken") or ""
        expires_in = int(data.get("expires_in") or data.get("expiresIn") or 7200)
        if not access:
            raise AHApiError("Geen access token ontvangen. Code of refresh token verlopen?")
        return {
            "access_token": access,
            "refresh_token": refresh,
            "expires_in": expires_in,
        }

    async def exchange_code(self, code: str) -> dict[str, Any]:
        data = await self._request(
            "POST",
            "/mobile-auth/v1/auth/token",
            json_body={"clientId": CLIENT_ID, "code": code},
        )
        return self._normalize_tokens(data)

    async def refresh_tokens(self, refresh_token: str) -> dict[str, Any]:
        data = await self._request(
            "POST",
            "/mobile-auth/v1/auth/token/refresh",
            json_body={"clientId": CLIENT_ID, "refreshToken": refresh_token},
        )
        return self._normalize_tokens(data)

    async def graphql(
        self, access_token: str, query: str, variables: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"query": query}
        if variables:
            payload["variables"] = variables
        data = await self._request(
            "POST",
            "/graphql",
            access_token=access_token,
            json_body=payload,
        )
        if isinstance(data, dict) and data.get("errors"):
            message = data["errors"][0].get("message", "GraphQL-fout")
            raise AHApiError(message)
        return (data or {}).get("data") or {}

    async def get(
        self,
        access_token: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> Any:
        return await self._request("GET", path, access_token=access_token, params=params)

    async def get_member(self, access_token: str) -> dict[str, Any] | None:
        try:
            data = await self.graphql(access_token, FETCH_MEMBER_QUERY)
            return normalize_member(data.get("member"))
        except AHApiError:
            data = await self.get(access_token, "/mobile-services/member/v3/member")
            return normalize_member(data)

    async def get_purchase_stamp_balance(self, access_token: str) -> dict[str, Any] | None:
        try:
            data = await self.graphql(access_token, PURCHASE_STAMP_BALANCE_QUERY)
            balance = data.get("purchaseStampBalance") or {}
            points = balance.get("points") or {}
            money = balance.get("money") or {}
            if not points and not money:
                return None
            return {
                "points": {
                    "current": points.get("currentBookletPoints", 0),
                    "fullBooklets": points.get("fullBooklets", 0),
                    "total": points.get("totalPoints", 0),
                },
                "money": {
                    "total": (money.get("payout") or {}).get("amount")
                    or ((money.get("invested") or {}).get("amount", 0)
                        + (money.get("interest") or {}).get("amount", 0)),
                    "investment": (money.get("invested") or {}).get("amount"),
                    "earnings": (money.get("interest") or {}).get("amount"),
                },
            }
        except AHApiError:
            data = await self.get(
                access_token, "/mobile-services/v1/purchase-stamps/balance"
            )
            return {
                "points": {
                    "current": data.get("currentBookletPoints", 0),
                    "fullBooklets": data.get("fullBooklets", 0),
                    "total": data.get("totalPoints", 0),
                },
                "money": {
                    "total": data.get("totalAmount"),
                    "investment": data.get("investedAmount"),
                    "earnings": data.get("interestAmount"),
                },
            }

    async def get_airmiles(self, access_token: str, has_card: bool = False) -> dict[str, Any] | None:
        try:
            data = await self.get(
                access_token, "/mobile-services/stamps/v1/airmiles/balances"
            )
            return {"balance": data.get("balance"), "url": data.get("url")}
        except AHApiError as err:
            if err.status == 404:
                if has_card:
                    return None
            raise

    async def get_shopping_list(self, access_token: str) -> list[dict[str, Any]]:
        data = await self.get(access_token, "/mobile-services/shoppinglist/v2/items")
        return (data or {}).get("items") or []

    async def get_bonusbox(self, access_token: str) -> dict[str, Any]:
        bonus_date = get_bonus_monday()
        data = await self.get(
            access_token,
            "/mobile-services/bonuspage/v1/choose-and-activate",
            params={"bonusStartDate": bonus_date},
        )
        return data

    async def get_personal_bonus(self, access_token: str) -> dict[str, Any]:
        bonus_date = get_bonus_monday()
        return await self.get(
            access_token,
            "/mobile-services/bonuspage/v2/section/personal",
            params={"date": bonus_date},
        )

    async def activate_bonus_offer(
        self,
        access_token: str,
        *,
        offer_id: str,
        segment_id: str,
        start_date: str,
    ) -> Any:
        body = urlencode({"segmentId": segment_id, "startDate": start_date})
        return await self._request(
            "PATCH",
            f"/mobile-services/bonuspage/v1/activate/{offer_id}",
            access_token=access_token,
            form_body=body,
            content_type="application/x-www-form-urlencoded; charset=utf-8",
        )

    async def fetch_dashboard(self, access_token: str) -> dict[str, Any]:
        member = await self.get_member(access_token)
        has_airmiles = bool(
            member and any(card.get("type") == "AM" for card in member.get("loyaltyCards") or [])
        )

        koopzegels = None
        airmiles = None
        shopping_list: list[dict[str, Any]] = []
        bonusbox_raw = None
        personal_bonus_raw = None

        try:
            koopzegels = await self.get_purchase_stamp_balance(access_token)
        except AHApiError as err:
            _LOGGER.warning("Koopzegels: %s", err)

        try:
            airmiles = await self.get_airmiles(access_token, has_airmiles)
        except AHApiError as err:
            _LOGGER.warning("Air Miles: %s", err)

        try:
            shopping_list = await self.get_shopping_list(access_token)
        except AHApiError as err:
            _LOGGER.warning("Boodschappenlijst: %s", err)

        try:
            bonusbox_raw = await self.get_bonusbox(access_token)
        except AHApiError as err:
            _LOGGER.warning("Bonusbox: %s", err)

        try:
            personal_bonus_raw = await self.get_personal_bonus(access_token)
        except AHApiError as err:
            _LOGGER.warning("Persoonlijke bonus: %s", err)

        bonusbox = build_bonusbox_section(bonusbox_raw, member) if bonusbox_raw else None
        personal_bonus = (
            {"offers": parse_bonus_offers(personal_bonus_raw)}
            if personal_bonus_raw
            else None
        )

        return {
            "member": member,
            "koopzegels": koopzegels,
            "airmiles": airmiles,
            "shoppingList": shopping_list,
            "bonusbox": bonusbox,
            "personalBonus": personal_bonus,
        }

    async def activate_all_bonus(
        self, access_token: str, source: str = "bonusbox"
    ) -> dict[str, Any]:
        dashboard = await self.fetch_dashboard(access_token)
        if source == "personalBonus":
            section = dashboard.get("personalBonus") or {}
            offers = [o for o in section.get("offers", []) if o.get("activatable")]
            remaining = len(offers)
        else:
            section = dashboard.get("bonusbox") or {}
            offers = [o for o in section.get("offers", []) if o.get("activatable")]
            remaining = section.get("remainingActivations", len(offers))
        if not offers:
            return {"activated": 0, "failed": 0, "results": []}

        to_activate = offers[: max(0, remaining)]

        results = []
        for offer in to_activate:
            try:
                await self.activate_bonus_offer(
                    access_token,
                    offer_id=str(offer["offerId"]),
                    segment_id=str(offer["segmentId"]),
                    start_date=str(offer["startDate"]),
                )
                results.append({"ok": True, "title": offer.get("title")})
            except AHApiError as err:
                results.append({"ok": False, "title": offer.get("title"), "error": str(err)})

        return {
            "activated": sum(1 for item in results if item.get("ok")),
            "failed": sum(1 for item in results if not item.get("ok")),
            "results": results,
        }
