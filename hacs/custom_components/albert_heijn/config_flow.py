"""Config flow for Albert Heijn."""

from __future__ import annotations

import logging
import time
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import AHApiError, AHClient
from .const import (
    CONF_ACCESS_TOKEN,
    CONF_EMAIL,
    CONF_MEMBER_ID,
    CONF_REFRESH_TOKEN,
    CONF_TOKEN_EXPIRES,
    DOMAIN,
    LOGIN_URL,
)
from .helpers import extract_oauth_code

_LOGGER = logging.getLogger(__name__)

STEP_LOGIN_SCHEMA = vol.Schema(
    {
        vol.Required("redirect"): str,
    }
)


class AHConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle Albert Heijn OAuth config flow."""

    VERSION = 2

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            session = async_get_clientsession(self.hass)
            client = AHClient(session)
            try:
                code = extract_oauth_code(user_input["redirect"])
                tokens = await client.exchange_code(code)
                access_token = tokens["access_token"]
                member = await client.get_member(access_token)
            except ValueError:
                errors["base"] = "invalid_redirect"
            except AHApiError as err:
                _LOGGER.error("Login failed: %s", err)
                errors["base"] = "invalid_auth"
            except Exception as err:
                _LOGGER.exception("Unexpected login error: %s", err)
                errors["base"] = "unknown"
            else:
                unique_id = str(member.get("memberId") if member else access_token[:16])
                email = (member or {}).get("email")
                await self.async_set_unique_id(unique_id)
                self._abort_if_unique_id_configured()

                title = "Albert Heijn"
                if email:
                    title = f"Albert Heijn ({email})"

                return self.async_create_entry(
                    title=title,
                    data={
                        CONF_REFRESH_TOKEN: tokens["refresh_token"],
                        CONF_ACCESS_TOKEN: access_token,
                        CONF_TOKEN_EXPIRES: time.time() + tokens["expires_in"],
                        CONF_MEMBER_ID: unique_id,
                        CONF_EMAIL: email,
                    },
                )

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_LOGIN_SCHEMA,
            errors=errors,
            description_placeholders={"login_url": LOGIN_URL},
        )

    async def async_step_reauth(self, entry_data: dict[str, Any]) -> FlowResult:
        return await self.async_step_user()
