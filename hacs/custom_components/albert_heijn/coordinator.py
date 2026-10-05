"""Data update coordinator."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import AHApiError, AHClient
from .const import (
    CONF_ACCESS_TOKEN,
    CONF_REFRESH_TOKEN,
    CONF_TOKEN_EXPIRES,
    DOMAIN,
    TOKEN_REFRESH_MARGIN_SECONDS,
    UPDATE_INTERVAL_SECONDS,
)

_LOGGER = logging.getLogger(__name__)


class AHCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Fetch Albert Heijn account data."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        client: AHClient,
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=UPDATE_INTERVAL_SECONDS),
        )
        self.entry = entry
        self.client = client

    async def _ensure_access_token(self) -> str:
        data = dict(self.entry.data)
        expires = float(data.get(CONF_TOKEN_EXPIRES) or 0)
        access = data.get(CONF_ACCESS_TOKEN)
        refresh = data.get(CONF_REFRESH_TOKEN)

        if access and time.time() < expires - TOKEN_REFRESH_MARGIN_SECONDS:
            return access

        if not refresh:
            raise UpdateFailed("Geen refresh token. Log opnieuw in via de integratie.")

        try:
            tokens = await self.client.refresh_tokens(refresh)
        except AHApiError as err:
            raise UpdateFailed(f"Token vernieuwen mislukt: {err}") from err

        new_data = {
            **data,
            CONF_ACCESS_TOKEN: tokens["access_token"],
            CONF_REFRESH_TOKEN: tokens.get("refresh_token") or refresh,
            CONF_TOKEN_EXPIRES: time.time() + tokens["expires_in"],
        }
        self.hass.config_entries.async_update_entry(self.entry, data=new_data)
        self.entry = self.hass.config_entries.async_get_entry(self.entry.entry_id) or self.entry
        return tokens["access_token"]

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            access_token = await self._ensure_access_token()
            dashboard = await self.client.fetch_dashboard(access_token)
        except UpdateFailed:
            raise
        except AHApiError as err:
            raise UpdateFailed(str(err)) from err
        except Exception as err:
            raise UpdateFailed(f"Onverwachte fout: {err}") from err

        return {
            "updated_at": datetime.now().isoformat(),
            "dashboard": dashboard,
        }

    async def async_activate_all_bonus(self, source: str = "bonusbox") -> dict[str, Any]:
        access_token = await self._ensure_access_token()
        result = await self.client.activate_all_bonus(access_token, source)
        await self.async_request_refresh()
        return result

    async def async_activate_bonus(
        self,
        *,
        offer_id: str,
        segment_id: str,
        start_date: str,
    ) -> None:
        access_token = await self._ensure_access_token()
        await self.client.activate_bonus_offer(
            access_token,
            offer_id=offer_id,
            segment_id=segment_id,
            start_date=start_date,
        )
        await self.async_request_refresh()
