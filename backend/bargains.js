import { ahGraphQL, getMember } from "./ah-client.js";

const STORES_SEARCH_QUERY = `query StoresSearch($filter: StoresFilterInput) {
  storesSearch(filter: $filter, limit: 8) {
    result {
      id
      name
      storeType
      address {
        street
        houseNumber
        houseNumberExtra
        postalCode
        city
      }
    }
  }
}`;

const BARGAIN_ITEMS_QUERY = `query BargainItems($storeId: String!) {
  bargainItems(storeId: $storeId) {
    product {
      id
      title
      brand
      salesUnitSize
      imagePack {
        small { url }
        medium { url }
        large { url }
      }
    }
    categoryTitle
    markdown {
      markdownType
      markdownExpirationDate
      markdownPercentage
    }
    stock
    bargainPrice {
      priceWas
      priceNow
    }
  }
}`;

function normalizeStore(store) {
  const address = store.address || {};
  const streetLine = [address.street, address.houseNumber, address.houseNumberExtra]
    .filter(Boolean)
    .join(" ");

  return {
    id: store.id,
    name: store.name,
    storeType: store.storeType || null,
    address: {
      street: streetLine,
      postalCode: address.postalCode || null,
      city: address.city || null,
    },
    label: [store.name, streetLine, address.city].filter(Boolean).join(" · "),
  };
}

function pickProductImage(product) {
  const pack = product?.imagePack;
  if (!Array.isArray(pack) || !pack.length) return null;
  const first = pack[0] || {};
  return first.medium?.url || first.large?.url || first.small?.url || null;
}

function normalizeBargain(item) {
  const product = item.product || {};
  const markdown = item.markdown || {};
  const price = item.bargainPrice || {};

  return {
    productId: product.id || null,
    title: product.title || "Product",
    brand: product.brand || null,
    salesUnitSize: product.salesUnitSize || null,
    image: pickProductImage(product),
    category: item.categoryTitle || "Overig",
    markdownType: markdown.markdownType || null,
    markdownPercentage: markdown.markdownPercentage ?? null,
    expirationDate: markdown.markdownExpirationDate || null,
    stock: item.stock ?? null,
    priceWas: price.priceWas ?? null,
    priceNow: price.priceNow ?? null,
  };
}

function groupBargainsByCategory(bargains) {
  const byCategory = new Map();

  for (const bargain of bargains) {
    const category = bargain.category || "Overig";
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category).push(bargain);
  }

  return [...byCategory.entries()]
    .map(([name, items]) => ({
      name,
      count: items.length,
      items: items.sort(
        (a, b) =>
          (b.markdownPercentage ?? 0) - (a.markdownPercentage ?? 0) ||
          String(a.title).localeCompare(String(b.title), "nl")
      ),
    }))
    .sort(
      (a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name), "nl")
    );
}

export async function fetchBargainContext(accessToken) {
  const member = await getMember(accessToken);
  const postalCode = member?.address?.zipCode || member?.address?.postalCode || null;

  return {
    defaultPostalCode: postalCode,
    city: member?.address?.city || null,
  };
}

export async function searchStoresByPostalCode(accessToken, postalCode) {
  const cleaned = String(postalCode || "").replace(/\s+/g, "").toUpperCase();
  if (!/^\d{4}[A-Z]{2}$/.test(cleaned)) {
    throw new Error("Gebruik een geldige postcode (bijv. 3521GZ).");
  }

  const data = await ahGraphQL(accessToken, STORES_SEARCH_QUERY, {
    filter: { postalCode: cleaned },
  });

  const stores = (data?.storesSearch?.result || []).map(normalizeStore);
  return {
    postalCode: cleaned,
    stores,
  };
}

export async function fetchBargainsForStore(accessToken, storeId) {
  const id = String(storeId || "").trim();
  if (!id) {
    throw new Error("storeId is verplicht.");
  }

  const data = await ahGraphQL(accessToken, BARGAIN_ITEMS_QUERY, {
    storeId: id,
  });

  const bargains = (data?.bargainItems || []).map(normalizeBargain);
  const categories = groupBargainsByCategory(bargains);

  return {
    storeId: id,
    fetchedAt: new Date().toISOString(),
    count: bargains.length,
    categoryCount: categories.length,
    categories,
    bargains,
  };
}
