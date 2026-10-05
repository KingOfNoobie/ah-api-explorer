"""Helpers for Albert Heijn integration."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

from .const import PREMIUM_MEMBERSHIP


def extract_oauth_code(value: str) -> str:
    """Extract OAuth code from appie:// redirect or raw paste."""
    cleaned = (value or "").strip()
    if not cleaned:
        raise ValueError("empty")

    if cleaned.startswith("appie://"):
        parsed = urlparse(cleaned)
        code = parse_qs(parsed.query).get("code", [None])[0]
        if code:
            return code
        raise ValueError("no_code")

    if "code=" in cleaned:
        if "://" in cleaned:
            parsed = urlparse(cleaned)
            code = parse_qs(parsed.query).get("code", [None])[0]
        else:
            code = parse_qs(cleaned).get("code", [None])[0]
        if code:
            return code
        raise ValueError("no_code")

    if len(cleaned) >= 8:
        return cleaned

    raise ValueError("invalid")


def get_bonus_monday() -> str:
    """Return YYYY-MM-DD for the current bonus week (Monday)."""
    now = datetime.now()
    if now.weekday() == 6:
        monday = now - timedelta(days=6)
    else:
        monday = now - timedelta(days=now.weekday())
    return monday.strftime("%Y-%m-%d")


def has_premium(member: dict[str, Any] | None) -> bool:
    memberships = (member or {}).get("memberships") or []
    return PREMIUM_MEMBERSHIP in memberships


def normalize_member(member: dict[str, Any] | None) -> dict[str, Any] | None:
    if not member:
        return None

    if member.get("loyaltyCards") and member.get("email"):
        return member

    loyalty_cards = []
    cards = member.get("cards") or {}
    if cards.get("bonus"):
        loyalty_cards.append({"id": cards["bonus"], "type": "BO"})
    if cards.get("airmiles"):
        loyalty_cards.append({"id": cards["airmiles"], "type": "AM"})
    if cards.get("gall"):
        loyalty_cards.append({"id": cards["gall"], "type": "GA"})

    name = member.get("name") or {}
    address = member.get("address") or {}

    return {
        "memberId": member.get("memberId") or member.get("id"),
        "email": member.get("email") or member.get("emailAddress"),
        "memberships": member.get("memberships") or [],
        "loyaltyCards": loyalty_cards,
        "address": {
            "street": address.get("street"),
            "houseNumber": address.get("houseNumber"),
            "houseNumberExtra": address.get("houseNumberExtra"),
            "zipCode": address.get("zipCode") or address.get("postalCode"),
            "city": address.get("city"),
            "country": address.get("country") or address.get("countryCode"),
        }
        if address
        else None,
        "name": {
            "firstName": name.get("firstName") or name.get("first"),
            "surname": name.get("surname") or name.get("last"),
        },
    }


def parse_bonus_offers(section: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not section or not section.get("bonusGroupOrProducts"):
        return []

    offers = []
    for entry in section["bonusGroupOrProducts"]:
        group = entry.get("bonusGroup") or entry
        product = entry.get("product")
        target = group if group.get("id") else product or entry
        status = target.get("activationStatus") or target.get("status") or ""
        offers.append(
            {
                "offerId": target.get("offerId") or target.get("id"),
                "segmentId": target.get("segmentId") or target.get("id"),
                "startDate": target.get("bonusStartDate") or target.get("offerStartDate"),
                "title": (
                    target.get("segmentDescription")
                    or target.get("title")
                    or target.get("description")
                    or "Bonusaanbieding"
                ),
                "discount": target.get("discountDescription") or "",
                "status": status,
                "activatable": status == "ACTIVATABLE",
                "activated": status == "ACTIVATED",
            }
        )
    return offers


def build_bonusbox_section(data: dict[str, Any] | None, member: dict[str, Any] | None) -> dict[str, Any]:
    offers = parse_bonus_offers(data)
    premium = has_premium(member)
    max_activations = (data or {}).get("maxActivations") or (10 if premium else 5)
    activated_count = sum(1 for offer in offers if offer.get("activated"))

    return {
        "maxActivations": max_activations,
        "activatedCount": activated_count,
        "activatableCount": sum(1 for offer in offers if offer.get("activatable")),
        "remainingActivations": max(0, max_activations - activated_count),
        "isPremium": premium,
        "offers": offers,
    }
