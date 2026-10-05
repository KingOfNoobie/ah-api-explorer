"""Binary sensors for Albert Heijn."""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import AHCoordinator
from .helpers import has_premium

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
    async_add_entities([AHPremiumBinarySensor(coordinator, entry)])


class AHPremiumBinarySensor(CoordinatorEntity[AHCoordinator], BinarySensorEntity):
    """Whether the account has AH Premium."""

    _attr_name = "Premium"
    _attr_icon = "mdi:crown"

    def __init__(self, coordinator: AHCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_premium"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "Albert Heijn",
            **DEVICE_INFO,
        }

    @property
    def is_on(self) -> bool:
        member = (self.coordinator.data.get("dashboard") or {}).get("member")
        return has_premium(member)
