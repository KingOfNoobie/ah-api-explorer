import { ahGet } from "./ah-client.js";
import {
  BONUS_CATEGORIES,
  BONUS_PROMOTION_TYPES,
  getBonusMonday,
  parseBonusOffers,
} from "./bonus-utils.js";

const PROMOTION_API_TYPES = new Set(["ETOS", "GALL", "GALLCARD", "AHONLINE"]);

function slugifyCategory(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeMetadataPeriod(period) {
  if (!period) return null;

  const nationalCategories = [];
  const promotionTypes = [];
  const seenNational = new Set();
  const seenPromotion = new Set();

  for (const tab of period.tabs || []) {
    for (const item of tab.urlMetadataList || []) {
      const bonusType = item.bonusType || "";
      const description = item.description || item.untranslatedDescription || "";

      if (bonusType === "NATIONAL" && description && !seenNational.has(description)) {
        seenNational.add(description);
        nationalCategories.push({
          id: slugifyCategory(description),
          label: description,
          bonusType,
        });
      }

      if (PROMOTION_API_TYPES.has(bonusType) && !seenPromotion.has(bonusType)) {
        seenPromotion.add(bonusType);
        const preset = BONUS_PROMOTION_TYPES.find(
          (entry) => entry.id === bonusType.toLowerCase()
        );
        promotionTypes.push({
          id: preset?.id || bonusType.toLowerCase(),
          label: description || preset?.label || bonusType,
          bonusType,
        });
      }
    }
  }

  return {
    bonusStartDate: period.bonusStartDate || getBonusMonday(),
    bonusEndDate: period.bonusEndDate || null,
    nextPeriodVisibleFrom: period.nextPeriodVisibleFrom || null,
    bonusFolderUrl: period.bonusFolderUrl || null,
    categories:
      nationalCategories.length > 0
        ? nationalCategories
        : BONUS_CATEGORIES.map((entry) => ({
            id: entry.id,
            label: entry.label,
            bonusType: "NATIONAL",
          })),
    promotionTypes:
      promotionTypes.length > 0
        ? promotionTypes
        : BONUS_PROMOTION_TYPES.map((entry) => ({
            id: entry.id,
            label: entry.label,
            bonusType: entry.id.toUpperCase() === "AHONLINE" ? "AHONLINE" : entry.id.toUpperCase(),
          })),
  };
}

async function fetchBonusMetadata(accessToken) {
  const data = await ahGet(accessToken, "/mobile-services/bonuspage/v3/metadata");
  const period = data?.periods?.[0] || null;
  return normalizeMetadataPeriod(period);
}

export async function fetchBonusCatalog(accessToken) {
  const period = await fetchBonusMetadata(accessToken);
  if (!period) {
    throw new Error(
      "Bonuscatalogus kon niet worden opgehaald. Controleer je internetverbinding en probeer opnieuw."
    );
  }

  return {
    fetchedAt: new Date().toISOString(),
    source: "metadata",
    bonusWeek: period.bonusStartDate,
    bonusEndDate: period.bonusEndDate,
    bonusFolderUrl: period.bonusFolderUrl,
    categories: period.categories,
    promotionTypes: period.promotionTypes,
  };
}

export async function fetchBonusSection(
  accessToken,
  { category, promotionType, date } = {}
) {
  const metadata = await fetchBonusMetadata(accessToken).catch(() => null);
  const bonusDate = date || metadata?.bonusStartDate || getBonusMonday();

  const query = {
    application: "AHWEBSHOP",
    date: bonusDate,
  };

  if (promotionType) {
    query.promotionType = promotionType;
  } else if (category) {
    query.category = category;
    query.promotionType = "NATIONAL";
  } else {
    throw new Error("Geef een categorie of promotionType op.");
  }

  const data = await ahGet(accessToken, "/mobile-services/bonuspage/v2/section", {
    query,
  });

  const categoryLabel =
    metadata?.categories?.find((entry) => entry.label === category)?.label || category;
  const promotionLabel =
    metadata?.promotionTypes?.find((entry) => entry.bonusType === promotionType)?.label ||
    promotionType;

  return {
    fetchedAt: new Date().toISOString(),
    bonusWeek: bonusDate,
    bonusEndDate: metadata?.bonusEndDate || null,
    category: category || null,
    promotionType: promotionType || null,
    title:
      data?.sectionDescription ||
      (category ? `Bonus · ${categoryLabel}` : `Bonus · ${promotionLabel}`),
    offers: parseBonusOffers(data),
  };
}
