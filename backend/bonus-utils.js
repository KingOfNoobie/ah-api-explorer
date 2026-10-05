export const BONUS_CATEGORIES = [
  { id: "groente", label: "Aardappel, groente, fruit" },
  { id: "maaltijden", label: "Salades, pizza, maaltijden" },
  { id: "vlees", label: "Vlees, kip, vis, vega" },
  { id: "kaas", label: "Kaas, vleeswaren, tapas" },
  { id: "zuivel", label: "Zuivel, plantaardig en eieren" },
  { id: "bakkerij", label: "Bakkerij en banket" },
  { id: "ontbijt", label: "Ontbijtgranen en beleg" },
  { id: "snoep", label: "Snoep, koek, chips en chocolade" },
  { id: "tussendoortjes", label: "Tussendoortjes" },
  { id: "dranken", label: "Frisdrank, sappen, koffie, thee" },
  { id: "wijn", label: "Wijn en bubbels" },
  { id: "bier", label: "Bier en aperitieven" },
  { id: "pasta", label: "Pasta, rijst en wereldkeuken" },
  { id: "soepen", label: "Soepen, sauzen, kruiden, olie" },
  { id: "diepvries", label: "Diepvries" },
  { id: "drogisterij", label: "Drogisterij" },
  { id: "baby", label: "Baby en kind" },
  { id: "huishouden", label: "Huishouden" },
  { id: "huisdier", label: "Huisdier" },
  { id: "koken", label: "Koken, tafelen, vrije tijd" },
];

export const BONUS_PROMOTION_TYPES = [
  { id: "etos", label: "Etos" },
  { id: "gall", label: "Gall & Gall" },
  { id: "gallcard", label: "Gall Card" },
  { id: "ahonline", label: "AH Online" },
];

export function getBonusMonday(date = new Date()) {
  const monday = new Date(date);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

export function parseBonusOffers(section) {
  if (!section?.bonusGroupOrProducts) return [];

  return section.bonusGroupOrProducts.map((entry) => {
    const group = entry.bonusGroup || entry;
    const product = entry.product;
    const target = group.id ? group : product || entry;

    return {
      offerId: target.offerId || target.id || null,
      segmentId: target.segmentId || target.id || null,
      startDate: target.bonusStartDate || target.offerStartDate || null,
      productId: product?.webshopId || target.webshopId || null,
      id: target.offerId || target.id || target.webshopId,
      title:
        target.segmentDescription ||
        target.title ||
        target.description ||
        "Bonusaanbieding",
      subtitle: target.subtitle || target.salesUnitSize || product?.salesUnitSize || "",
      discount: target.discountDescription || "",
      period: target.bonusPeriodDescription || "",
      category: target.category || target.mainCategory || "",
      image:
        target.images?.find((img) => img.width >= 200)?.url ||
        product?.images?.find((img) => img.width >= 200)?.url ||
        target.images?.[0]?.url ||
        product?.images?.[0]?.url ||
        null,
      status: target.activationStatus || target.status || null,
      activatable: (target.activationStatus || "") === "ACTIVATABLE",
      activated: (target.activationStatus || "") === "ACTIVATED",
      endDate: target.bonusEndDate || null,
      promotionType: target.promotionType || target.segmentType || null,
    };
  });
}
