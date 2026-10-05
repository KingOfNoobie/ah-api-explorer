"""Buttons for Albert Heijn."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import AHCoordinator

DEVICE_INFO = {
    "manufacturer": "Albert Heijn",
    "model": "Mijn AH",
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: AHCoordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    async_add_entities(
        [
            AHRefreshButton(coordinator, entry),
            AHActivateAllBonusButton(coordinator, entry),
            AHActivateAllPersonalBonusButton(coordinator, entry),
        ]
    )


class AHRefreshButton(CoordinatorEntity[AHCoordinator], ButtonEntity):
    _attr_name = "Gegevens vernieuwen"
    _attr_icon = "mdi:refresh"

    def __init__(self, coordinator: AHCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_refresh"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "Albert Heijn",
            **DEVICE_INFO,
        }

    async def async_press(self) -> None:
        await self.coordinator.async_request_refresh()


class AHActivateAllBonusButton(CoordinatorEntity[AHCoordinator], ButtonEntity):
    _attr_name = "Bonusbox alles activeren"
    _attr_icon = "mdi:tag-multiple"

    def __init__(self, coordinator: AHCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_activate_all_bonus"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "Albert Heijn",
            **DEVICE_INFO,
        }

    async def async_press(self) -> None:
        await self.coordinator.async_activate_all_bonus("bonusbox")


class AHActivateAllPersonalBonusButton(CoordinatorEntity[AHCoordinator], ButtonEntity):
    _attr_name = "Persoonlijke bonus alles activeren"
    _attr_icon = "mdi:tag-heart"

    def __init__(self, coordinator: AHCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_activate_all_personal"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "Albert Heijn",
            **DEVICE_INFO,
        }

    async def async_press(self) -> None:
        await self.coordinator.async_activate_all_bonus("personalBonus")
