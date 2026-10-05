import { getShoppingList, patchShoppingList, searchProducts } from "./ah-client.js";

function normalizeListItem(item) {
  const product = item.productDetails?.product || item.product || {};

  return {
    listItemId: item.listItemId ?? null,
    quantity: item.quantity ?? 1,
    strikedthrough: Boolean(item.strikedthrough ?? item.strikeThrough),
    position: item.position ?? 0,
    productId: product.webshopId || item.productId || null,
    originCode: item.originCode || "PRD",
    type: item.type || "SHOPPABLE",
    title: product.title || item.description || "Product",
    salesUnitSize: product.salesUnitSize || null,
    image: product.images?.find((img) => img.width >= 80)?.url || product.images?.[0]?.url || null,
    price: product.priceBeforeBonus ?? product.price?.amount ?? null,
  };
}

function toPatchItem(item, overrides = {}) {
  const merged = { ...item, ...overrides };
  const patch = {
    quantity: merged.quantity,
    position: merged.position ?? 1,
    productId: merged.productId,
    originCode: merged.originCode || "PRD",
    type: merged.type || "SHOPPABLE",
    strikeThrough: Boolean(merged.strikedthrough ?? merged.strikeThrough),
  };

  if (merged.listItemId) {
    patch.listItemId = merged.listItemId;
  }

  return patch;
}

export async function fetchShoppingList(accessToken) {
  const items = await getShoppingList(accessToken);
  return {
    fetchedAt: new Date().toISOString(),
    items: items.map(normalizeListItem),
  };
}

export async function fetchProductSearch(accessToken, query, page = 0) {
  const trimmed = String(query || "").trim();
  if (trimmed.length < 2) {
    throw new Error("Zoekterm moet minimaal 2 tekens zijn.");
  }

  return searchProducts(accessToken, trimmed, page);
}

export async function updateShoppingListItems(accessToken, items) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("Geen lijstitems opgegeven.");
  }

  const payload = items.map((item) => toPatchItem(item));
  const data = await patchShoppingList(accessToken, payload);
  return {
    items: (data?.items || []).map(normalizeListItem),
  };
}

export async function addProductToList(accessToken, productId, quantity = 1) {
  const current = await getShoppingList(accessToken);
  const maxPosition = current.reduce((max, item) => Math.max(max, item.position ?? 0), 0);

  const data = await patchShoppingList(accessToken, [
    {
      strikeThrough: false,
      quantity,
      position: maxPosition + 1,
      productId: Number(productId),
      originCode: "PRD",
      type: "SHOPPABLE",
    },
  ]);

  return {
    items: (data?.items || []).map(normalizeListItem),
  };
}

export async function removeListItem(accessToken, item) {
  return updateShoppingListItems(accessToken, [
    {
      ...item,
      quantity: 0,
    },
  ]);
}

export async function toggleListItemStrike(accessToken, item) {
  return updateShoppingListItems(accessToken, [
    {
      ...item,
      strikedthrough: !item.strikedthrough,
    },
  ]);
}

export async function changeListItemQuantity(accessToken, item, quantity) {
  if (quantity <= 0) {
    return removeListItem(accessToken, item);
  }

  return updateShoppingListItems(accessToken, [
    {
      ...item,
      quantity,
    },
  ]);
}
