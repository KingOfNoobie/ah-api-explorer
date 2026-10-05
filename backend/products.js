import { ahGet } from "./ah-client.js";

function pickProductImage(images) {
  if (!Array.isArray(images) || !images.length) return null;
  return (
    images.find((image) => image.width >= 400)?.url ||
    images.find((image) => image.width >= 200)?.url ||
    images[0]?.url ||
    null
  );
}

function stripHtml(html) {
  if (!html) return null;
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function parseNutrients(tradeItem) {
  const blocks = [
    tradeItem?.nutrientHeader?.nutrientDetail,
    tradeItem?.nutrientInformation?.nutrientDetail,
    tradeItem?.nutritionInformation,
    tradeItem?.nutrients,
  ].filter(Boolean);

  const nutrients = [];
  for (const block of blocks) {
    const items = Array.isArray(block) ? block : [block];
    for (const item of items) {
      const name =
        item?.nutrientTypeCode?.label ||
        item?.nutrientTypeCode?.value ||
        item?.name ||
        item?.nutrientType ||
        null;
      const value = item?.quantityContained ?? item?.value ?? item?.amount;
      if (!name || value === null || value === undefined) continue;
      nutrients.push({
        name,
        value,
        unit:
          item?.quantityContainedUnit?.label ||
          item?.quantityContainedUnit?.value ||
          item?.unit ||
          "",
      });
    }
  }

  return nutrients;
}

function parseAllergens(tradeItem) {
  const allergens = [];
  for (const block of tradeItem?.allergenInformation || []) {
    for (const item of block.items || []) {
      if ((item.levelOfContainmentCode?.value || "") === "CONTAINS") {
        const label = item.typeCode?.label || item.typeCode?.value;
        if (label) allergens.push(label);
      }
    }
  }
  return [...new Set(allergens)];
}

function normalizeProductDetail(data) {
  const card = data?.productCard || data || {};
  const trade = data?.tradeItem || {};
  const bonusInfo = card.activatableDiscount || data?.activatableDiscount || null;
  const images = card.images || [];

  return {
    productId: card.webshopId || data?.productId || null,
    title: card.title || "Product",
    brand: card.brand || null,
    salesUnitSize: card.salesUnitSize || null,
    image: pickProductImage(images),
    images: images
      .filter((image) => image.width >= 200)
      .sort((a, b) => b.width - a.width)
      .map((image) => image.url),
    price: card.priceBeforeBonus ?? card.currentPrice ?? card.price?.amount ?? null,
    priceBeforeBonus: card.priceBeforeBonus ?? null,
    bonusPrice: card.bonusPrice ?? bonusInfo?.bonusPrice ?? null,
    unitPriceDescription: card.unitPriceDescription || null,
    mainCategory: card.mainCategory || null,
    subCategory: card.subCategory || null,
    isBonus: Boolean(card.isBonus || card.bonusMechanism || bonusInfo),
    bonusLabel:
      card.discountDescription ||
      card.bonusMechanism ||
      bonusInfo?.discountDescription ||
      null,
    activatable: Boolean(
      (bonusInfo?.activationStatus || card.activationStatus) === "ACTIVATABLE"
    ),
    activated: Boolean(
      (bonusInfo?.activationStatus || card.activationStatus) === "ACTIVATED"
    ),
    descriptionHtml: card.descriptionHighlights || null,
    descriptionText: stripHtml(card.descriptionHighlights),
    ingredients: trade.foodAndBeverageIngredientStatement || null,
    allergens: parseAllergens(trade),
    alcoholPercentage: trade.alcoholInformation?.percentageOfAlcoholByVolume ?? null,
    storageInstructions:
      trade.consumerInstructions?.storageInstructions?.filter(Boolean).join(" · ") || null,
    usageInstructions:
      trade.consumerInstructions?.usageInstructions?.filter(Boolean).join(" · ") || null,
    gtin: trade.gtin || null,
    availableOnline: card.availableOnline ?? null,
    orderAvailabilityStatus: card.orderAvailabilityStatus || null,
    nutrients: parseNutrients(trade),
    disclaimer: data?.disclaimerText || null,
    offerId: bonusInfo?.offerId || card.offerId || null,
    segmentId: bonusInfo?.segmentId || card.segmentId || null,
    startDate: bonusInfo?.bonusStartDate || card.bonusStartDate || null,
  };
}

export async function fetchProductDetail(accessToken, productId) {
  const id = String(productId || "").trim();
  if (!/^\d+$/.test(id)) {
    throw new Error("Ongeldig product-ID.");
  }

  const headers = { "x-application": "AHWEBSHOP" };
  let raw = null;
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const version of ["v4", "v3"]) {
      try {
        raw = await ahGet(accessToken, `/mobile-services/product/detail/${version}/fir/${id}`, {
          query: { includeActivatableDiscount: "true" },
          headers,
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (raw) break;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  if (!raw) {
    throw lastError || new Error("Product kon niet worden geladen.");
  }

  return {
    fetchedAt: new Date().toISOString(),
    product: normalizeProductDetail(raw),
  };
}
