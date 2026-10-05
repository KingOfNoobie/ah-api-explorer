"""Sensors for Albert Heijn."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorStateClass
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
            AHKoopzegelsSensor(coordinator, entry),
            AHKoopzegelsValueSensor(coordinator, entry),
            AHAirmilesSensor(coordinator, entry),
            AHShoppingListSensor(coordinator, entry),
            AHBonusRemainingSensor(coordinator, entry),
            AHBonusActivatableSensor(coordinator, entry),
            AHBonusMaxSensor(coordinator, entry),
        ]
    )


class AHSensorBase(CoordinatorEntity[AHCoordinator], SensorEntity):
    """Base sensor."""

    def __init__(
        self,
        coordinator: AHCoordinator,
        entry: ConfigEntry,
        unique_suffix: str,
        name: str,
        icon: str,
    ) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_{unique_suffix}"
        self._attr_name = name
        self._attr_icon = icon
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": "Albert Heijn",
            **DEVICE_INFO,
        }


class AHKoopzegelsSensor(AHSensorBase):
    _attr_native_unit_of_measurement = "zegels"

    def __init__(self, coordinator: AHCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "koopzegels", "Koopzegels", "mdi:stamp")

    @property
    def native_value(self):
        koop = (self.coordinator.data.get("dashboard") or {}).get("koopzegels") or {}
        return (koop.get("points") or {}).get("current")


class AHKoopzegelsValueSensor(AHSensorBase):
    _attr_native_unit_of_measurement = "EUR"

    def __init__(self, coordinator: AHCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "koopzegels_value", "Koopzegels waarde", "mdi:cash")

    @property
    def native_value(self):
        koop = (self.coordinator.data.get("dashboard") or {}).get("koopzegels") or {}
        return (koop.get("money") or {}).get("total")


class AHAirmilesSensor(AHSensorBase):
    _attr_native_unit_of_measurement = "miles"

    def __init__(self, coordinator: AHCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "airmiles", "Air Miles", "mdi:airplane")

    @property
    def native_value(self):
        miles = (self.coordinator.data.get("dashboard") or {}).get("airmiles") or {}
        return miles.get("balance")


class AHShoppingListSensor(AHSensorBase):
    _attr_native_unit_of_measurement = "items"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: AHCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "shopping_list", "Boodschappenlijst", "mdi:cart")

    @property
    def native_value(self):
        items = (self.coordinator.data.get("dashboard") or {}).get("shoppingList") or []
        return len(items)


class AHBonusRemainingSensor(AHSensorBase):
    def __init__(self, coordinator: AHCoordinator, entry: ConfigEntry) -> None:
        super().__init__(
            coordinator, entry, "bonus_remaining", "Bonus activaties over", "mdi:tag-outline"
        )

    @property
    def native_value(self):
        bonusbox = (self.coordinator.data.get("dashboard") or {}).get("bonusbox") or {}
        return bonusbox.get("remainingActivations")


class AHBonusActivatableSensor(AHSensorBase):
    def __init__(self, coordinator: AHCoordinator, entry: ConfigEntry) -> None:
        super().__init__(
            coordinator, entry, "bonus_activatable", "Bonus activeerbaar", "mdi:tag-plus"
        )

    @property
    def native_value(self):
        bonusbox = (self.coordinator.data.get("dashboard") or {}).get("bonusbox") or {}
        return bonusbox.get("activatableCount")


class AHBonusMaxSensor(AHSensorBase):
    def __init__(self, coordinator: AHCoordinator, entry: ConfigEntry) -> None:
        super().__init__(
            coordinator, entry, "bonus_max", "Bonus max per week", "mdi:tag-multiple"
        )

    @property
    def native_value(self):
        bonusbox = (self.coordinator.data.get("dashboard") or {}).get("bonusbox") or {}
        return bonusbox.get("maxActivations")
