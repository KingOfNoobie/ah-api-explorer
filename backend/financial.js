import {
  getAllReceiptSummaries,
  getMember,
  getPurchaseStampBalance,
  getReceiptDetails,
} from "./ah-client.js";

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function hasPremiumMembership(member) {
  return Array.isArray(member?.memberships) && member.memberships.includes("PREMIUM");
}

export async function resolveFinancialContext(accessToken) {
  const [memberResult, stampResult] = await Promise.allSettled([
    getMember(accessToken),
    getPurchaseStampBalance(accessToken),
  ]);

  const member = memberResult.status === "fulfilled" ? memberResult.value : null;
  const stampBalance = stampResult.status === "fulfilled" ? stampResult.value : null;
  const stampPrice = stampBalance?.constants?.stampPrice ?? 0.1;

  return {
    isPremium: hasPremiumMembership(member),
    stampPrice,
    stampPriceSource: stampBalance?.constants?.stampPrice ? "api" : "default",
  };
}

function isCarryBagProduct(name) {
  return /DRAAGTAS/i.test(String(name || ""));
}

function monthKeyFromDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseMonthParam(monthParam) {
  const match = String(monthParam || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), key: `${match[1]}-${match[2]}` };
}

function normalizeProductKey(name) {
  return String(name || "Onbekend product")
    .trim()
    .toUpperCase();
}

function groupReceiptsByMonth(receipts) {
  const months = new Map();

  for (const receipt of receipts) {
    const key = monthKeyFromDate(receipt.transactionMoment);
    if (!key) continue;

    if (!months.has(key)) {
      months.set(key, {
        month: key,
        receiptCount: 0,
        totalSpent: 0,
        receipts: [],
      });
    }

    const entry = months.get(key);
    const amount = Number(receipt.totalAmount ?? receipt.total?.amount?.amount ?? 0);
    entry.receiptCount += 1;
    entry.totalSpent = Math.round((entry.totalSpent + amount) * 100) / 100;
    entry.receipts.push({
      transactionId: receipt.transactionId,
      transactionMoment: receipt.transactionMoment,
      totalAmount: amount,
    });
  }

  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
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

function buildTopProducts(productLines) {
  const byKey = new Map();

  for (const line of productLines) {
    const key = normalizeProductKey(line.name);
    const existing = byKey.get(key) || {
      name: line.name,
      quantity: 0,
      spend: 0,
    };
    existing.quantity += line.quantity || 1;
    existing.spend = Math.round((existing.spend + (line.amount || 0)) * 100) / 100;
    byKey.set(key, existing);
  }

  const products = [...byKey.values()];
  const topByQuantity = [...products]
    .sort((a, b) => b.quantity - a.quantity || b.spend - a.spend)
    .slice(0, 3);
  const topBySpend = [...products]
    .sort((a, b) => b.spend - a.spend || b.quantity - a.quantity)
    .slice(0, 3);

  return {
    uniqueProducts: products.length,
    topByQuantity,
    topBySpend,
  };
}

function aggregateKoopzegels(details) {
  let count = 0;
  let spent = 0;
  let inferredReceipts = 0;

  for (const detail of details) {
    for (const line of detail.koopzegels || []) {
      count += line.quantity ?? 1;
      spent += line.amount ?? 0;
    }
    if (detail.inferredKoopzegels) {
      inferredReceipts += 1;
    }
  }

  return {
    count,
    spent: roundMoney(spent),
    inferredReceipts,
  };
}

function aggregateDiscounts(details) {
  return roundMoney(details.reduce((sum, detail) => sum + (detail.discountTotal || 0), 0));
}

function aggregateCarryBags(details) {
  let count = 0;
  let spent = 0;
  let receiptCount = 0;

  for (const detail of details) {
    let bagsOnReceipt = 0;

    for (const product of detail.products || []) {
      if (!isCarryBagProduct(product.name)) continue;
      const quantity = product.quantity ?? 1;
      bagsOnReceipt += quantity;
      count += quantity;
      spent += product.amount ?? 0;
    }

    if (bagsOnReceipt > 0) {
      receiptCount += 1;
    }
  }

  return {
    count,
    spent: roundMoney(spent),
    receiptCount,
  };
}

export async function fetchFinancialMonths(accessToken) {
  const [receipts, context] = await Promise.all([
    getAllReceiptSummaries(accessToken),
    resolveFinancialContext(accessToken),
  ]);
  const months = groupReceiptsByMonth(receipts);

  return {
    fetchedAt: new Date().toISOString(),
    receiptCount: receipts.length,
    isPremium: context.isPremium,
    stampPrice: context.stampPrice,
    months: months.map((entry) => ({
      month: entry.month,
      receiptCount: entry.receiptCount,
      totalSpent: entry.totalSpent,
      averagePerTrip:
        entry.receiptCount > 0
          ? Math.round((entry.totalSpent / entry.receiptCount) * 100) / 100
          : 0,
    })),
  };
}

export async function fetchFinancialMonth(accessToken, monthParam, options = {}) {
  const parsed = parseMonthParam(monthParam);
  if (!parsed) {
    throw new Error("Ongeldige maand. Gebruik formaat YYYY-MM (bijv. 2026-07).");
  }

  const context = await resolveFinancialContext(accessToken);
  const stampPrice = options.stampPrice ?? context.stampPrice;

  const receipts = await getAllReceiptSummaries(accessToken);
  const monthReceipts = receipts
    .filter((receipt) => monthKeyFromDate(receipt.transactionMoment) === parsed.key)
    .sort((a, b) => new Date(b.transactionMoment) - new Date(a.transactionMoment));

  if (!monthReceipts.length) {
    return {
      month: parsed.key,
      receiptCount: 0,
      totalSpent: 0,
      averagePerTrip: 0,
      receipts: [],
      topByQuantity: [],
      topBySpend: [],
      uniqueProducts: 0,
      analyzedReceipts: 0,
      isPremium: context.isPremium,
      stampPrice,
      koopzegels: { count: 0, spent: 0, inferredReceipts: 0 },
      carryBags: { count: 0, spent: 0, receiptCount: 0 },
      discountTotal: 0,
    };
  }

  const totalSpent = Math.round(
    monthReceipts.reduce(
      (sum, receipt) =>
        sum + Number(receipt.totalAmount ?? receipt.total?.amount?.amount ?? 0),
      0
    ) * 100
  ) / 100;

  const details = await mapPool(
    monthReceipts,
    (receipt) =>
      getReceiptDetails(accessToken, receipt.transactionId, {
        transactionMoment: receipt.transactionMoment,
        totalAmount: receipt.totalAmount,
        stampPrice,
      }),
    4
  );

  const productLines = details.flatMap((detail) =>
    (detail.products || []).map((product) => ({
      name: product.name,
      quantity: product.quantity ?? 1,
      amount: product.amount ?? 0,
    }))
  );

  const tops = buildTopProducts(productLines);
  const koopzegels = aggregateKoopzegels(details);
  const carryBags = aggregateCarryBags(details);
  const discountTotal = aggregateDiscounts(details);

  return {
    month: parsed.key,
    receiptCount: monthReceipts.length,
    totalSpent,
    averagePerTrip:
      monthReceipts.length > 0
        ? Math.round((totalSpent / monthReceipts.length) * 100) / 100
        : 0,
    receipts: monthReceipts,
    analyzedReceipts: details.length,
    uniqueProducts: tops.uniqueProducts,
    topByQuantity: tops.topByQuantity,
    topBySpend: tops.topBySpend,
    isPremium: context.isPremium,
    stampPrice,
    koopzegels,
    carryBags,
    discountTotal,
  };
}
