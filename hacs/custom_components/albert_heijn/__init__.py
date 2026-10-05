"""Albert Heijn integration."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import AHClient
from .const import DOMAIN
from .coordinator import AHCoordinator

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor", "button", "binary_sensor"]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up services."""

    async def handle_activate_all(call: ServiceCall) -> None:
        entry_id = call.data["config_entry"]
        source = call.data.get("source", "bonusbox")
        coordinator: AHCoordinator = hass.data[DOMAIN][entry_id]["coordinator"]
        await coordinator.async_activate_all_bonus(source)

    async def handle_activate_bonus(call: ServiceCall) -> None:
        entry_id = call.data["config_entry"]
        coordinator: AHCoordinator = hass.data[DOMAIN][entry_id]["coordinator"]
        await coordinator.async_activate_bonus(
            offer_id=str(call.data["offer_id"]),
            segment_id=str(call.data["segment_id"]),
            start_date=str(call.data["start_date"]),
        )

    hass.services.async_register(DOMAIN, "activate_all_bonus", handle_activate_all)
    hass.services.async_register(DOMAIN, "activate_bonus", handle_activate_bonus)

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Albert Heijn from a config entry."""
    session = async_get_clientsession(hass)
    client = AHClient(session)
    coordinator = AHCoordinator(hass, entry, client)

    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {"coordinator": coordinator, "client": client}

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok
