import { getAllReceiptSummaries, getReceiptDetails } from "./ah-client.js";

function normalizeProductKey(name) {
  return String(name || "Onbekend product")
    .trim()
    .toUpperCase();
}

function shouldSkipProduct(name) {
  return /DRAAGTAS|KOOPZEGEL|SPARZEGEL|STATIEGEL|DIGITALE ZEGEL/i.test(String(name || ""));
}

async function mapPool(items, mapper, concurrency = 4) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function fetchPreviouslyBought(accessToken, { receiptLimit = 50, productLimit = 30 } = {}) {
  const receipts = await getAllReceiptSummaries(accessToken);
  const recent = receipts.slice(0, receiptLimit);

  const details = await mapPool(
    recent,
    (receipt) =>
      getReceiptDetails(accessToken, receipt.transactionId, {
        transactionMoment: receipt.transactionMoment,
        totalAmount: receipt.totalAmount,
      }),
    4
  );

  const byKey = new Map();

  for (const detail of details) {
    if (!detail?.products?.length) continue;

    const purchasedAt = detail.transactionMoment;

    for (const product of detail.products) {
      if (shouldSkipProduct(product.name)) continue;

      const key = product.productId
        ? `id:${product.productId}`
        : `name:${normalizeProductKey(product.name)}`;

      const existing = byKey.get(key) || {
        productId: product.productId || null,
        name: product.name,
        purchaseCount: 0,
        totalQuantity: 0,
        lastPurchased: null,
        lastAmount: null,
      };

      existing.purchaseCount += 1;
      existing.totalQuantity += product.quantity ?? 1;
      existing.lastAmount = product.amount ?? existing.lastAmount;

      if (
        purchasedAt &&
        (!existing.lastPurchased || new Date(purchasedAt) > new Date(existing.lastPurchased))
      ) {
        existing.lastPurchased = purchasedAt;
      }

      byKey.set(key, existing);
    }
  }

  const products = [...byKey.values()]
    .sort(
      (a, b) =>
        b.purchaseCount - a.purchaseCount ||
        new Date(b.lastPurchased || 0) - new Date(a.lastPurchased || 0)
    )
    .slice(0, productLimit);

  return {
    fetchedAt: new Date().toISOString(),
    analyzedReceipts: details.length,
    products,
  };
}
