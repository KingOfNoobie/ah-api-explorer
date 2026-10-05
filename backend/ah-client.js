const AH_BASE = "https://api.ah.nl";
const CLIENT_ID = "appie";
const USER_AGENT = "Appie/8.22.3";
const LOGIN_URL =
  "https://login.ah.nl/secure/oauth/authorize?client_id=appie&redirect_uri=appie%3A%2F%2Flogin-exit&response_type=code";

export function getLoginUrl() {
  return LOGIN_URL;
}

async function ahFetch(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  const headers = {
    "User-Agent": USER_AGENT,
    ...(options.headers || {}),
  };

  if (!headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(`${AH_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const message =
        data?.message ||
        data?.error_description ||
        data?.error ||
        (typeof data?.raw === "string" ? data.raw.slice(0, 200) : null) ||
        `AH API fout (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("AH API reageerde niet op tijd (timeout).");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTokens(data) {
  const tokens = {
    accessToken: data.access_token || data.accessToken || "",
    refreshToken: data.refresh_token || data.refreshToken || "",
    expiresIn: data.expires_in || data.expiresIn || 7200,
    memberId: data.memberId || extractMemberId(data.access_token || data.accessToken),
  };

  if (!tokens.accessToken) {
    throw new Error(
      "AH gaf geen access token terug. Je code of refresh token is waarschijnlijk verlopen."
    );
  }

  return tokens;
}

function extractMemberId(accessToken) {
  if (!accessToken || !accessToken.includes("_")) return null;
  const [memberId] = accessToken.split("_");
  return memberId || null;
}

export async function getAnonymousToken() {
  const data = await ahFetch("/mobile-auth/v1/auth/token/anonymous", {
    method: "POST",
    body: JSON.stringify({ clientId: CLIENT_ID }),
  });
  return normalizeTokens(data);
}

export async function exchangeCode(code) {
  const data = await ahFetch("/mobile-auth/v1/auth/token", {
    method: "POST",
    body: JSON.stringify({ clientId: CLIENT_ID, code }),
  });
  return normalizeTokens(data);
}

export async function refreshTokens(refreshToken) {
  const data = await ahFetch("/mobile-auth/v1/auth/token/refresh", {
    method: "POST",
    body: JSON.stringify({ clientId: CLIENT_ID, refreshToken }),
  });
  return normalizeTokens(data);
}

const FETCH_MEMBER_QUERY = `query FetchMember {
  member {
    id
    emailAddress
    gender
    dateOfBirth
    phoneNumber
    memberships
    name { first last }
    address {
      street
      houseNumber
      houseNumberExtra
      postalCode
      city
      countryCode
    }
    cards { airmiles bonus gall }
  }
}`;

const FETCH_POS_RECEIPTS_QUERY = `query FetchPosReceipts($offset: Int!, $limit: Int!) {
  posReceiptsPage(pagination: {offset: $offset, limit: $limit}) {
    posReceipts {
      id
      dateTime
      totalAmount { amount }
    }
  }
}`;

function normalizeMember(member) {
  if (!member) return null;

  if (member.loyaltyCards && member.email) {
    return member;
  }

  const loyaltyCards = [];
  if (member.cards?.bonus) loyaltyCards.push({ id: member.cards.bonus, type: "BO" });
  if (member.cards?.airmiles) loyaltyCards.push({ id: member.cards.airmiles, type: "AM" });
  if (member.cards?.gall) loyaltyCards.push({ id: member.cards.gall, type: "GA" });

  return {
    memberId: member.memberId ?? member.id,
    email: member.email ?? member.emailAddress,
    memberships: member.memberships || [],
    loyaltyCards,
    address: member.address
      ? {
          street: member.address.street,
          houseNumber: member.address.houseNumber,
          houseNumberExtra: member.address.houseNumberExtra,
          zipCode: member.address.zipCode ?? member.address.postalCode,
          city: member.address.city,
          country: member.address.country ?? member.address.countryCode,
        }
      : null,
    phoneNumber: member.phoneNumber,
    dateOfBirth: member.dateOfBirth,
    name: member.name?.firstName
      ? member.name
      : {
          firstName: member.name?.first,
          surname: member.name?.last,
        },
    gender: member.gender,
    source: "graphql",
  };
}

export async function getMember(accessToken) {
  try {
    const data = await ahGraphQL(accessToken, FETCH_MEMBER_QUERY);
    const member = normalizeMember(data.member);
    if (member) return member;
  } catch {
    // GraphQL is preferred; fall back to legacy REST when needed.
  }

  const data = await ahGet(accessToken, "/mobile-services/member/v3/member");
  return normalizeMember(data);
}

const FETCH_POS_RECEIPT_DETAILS_QUERY = `query FetchReceipt($id: String!) {
  posReceiptDetails(id: $id) {
    id
    products {
      id
      quantity
      name
      price { amount }
      amount { amount }
    }
    discounts {
      name
      amount { amount }
    }
    payments {
      method
      amount { amount }
    }
  }
}`;

function inferKoopzegelsFromGap(gap, stampPrice = 0.1) {
  if (gap <= 0.004 || !stampPrice) return null;

  const count = Math.round(gap / stampPrice);
  if (count <= 0) return null;

  const expected = Math.round(count * stampPrice * 100) / 100;
  if (Math.abs(expected - gap) > 0.06) return null;

  return {
    label: `Koopzegels (${count}× €${stampPrice.toFixed(2)})`,
    amount: gap,
    quantity: count,
    stampPrice,
    inferred: true,
  };
}

function extractKoopzegelLines(products = [], discounts = []) {
  const pattern = /koopzegel|spaarzegel|digital savings|digitale zegel/i;

  return [
    ...products
      .filter((product) => pattern.test(product.name || ""))
      .map((product) => ({
        label: product.name,
        amount: product.amount ?? 0,
        quantity: product.quantity ?? 1,
      })),
    ...discounts
      .filter((discount) => pattern.test(discount.name || ""))
      .map((discount) => ({
        label: discount.name,
        amount: -(discount.amount ?? 0),
        quantity: 1,
      })),
  ];
}

function normalizeReceiptDetails(details, meta = {}) {
  if (!details?.products) return null;

  const products = details.products.map((product) => ({
    name: product.name,
    quantity: product.quantity ?? 1,
    unitPrice: product.price?.amount ?? null,
    amount: product.amount?.amount ?? 0,
    productId: product.id ?? null,
  }));

  const discounts = (details.discounts || []).map((discount) => ({
    name: discount.name,
    amount: discount.amount?.amount ?? 0,
  }));

  const payments = (details.payments || []).map((payment) => ({
    method: payment.method,
    amount: payment.amount?.amount ?? 0,
  }));

  const productTotal = products.reduce((sum, product) => sum + product.amount, 0);
  const discountTotal = discounts.reduce(
    (sum, discount) => sum + Math.abs(discount.amount ?? 0),
    0
  );
  const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const netProducts = Math.round((productTotal - discountTotal) * 100) / 100;
  const total = paymentTotal || meta.totalAmount || Math.max(0, netProducts);
  const unaccountedAmount = Math.round((total - netProducts) * 100) / 100;

  let koopzegels = extractKoopzegelLines(products, discounts);
  let inferredKoopzegels = null;

  if (!koopzegels.length && unaccountedAmount > 0) {
    inferredKoopzegels = inferKoopzegelsFromGap(
      unaccountedAmount,
      meta.stampPrice ?? 0.1
    );
    if (inferredKoopzegels) {
      koopzegels = [inferredKoopzegels];
    }
  }

  return {
    transactionId: details.id,
    transactionMoment: meta.transactionMoment || null,
    products,
    discounts,
    payments,
    koopzegels,
    inferredKoopzegels,
    grossProducts: Math.round(productTotal * 100) / 100,
    discountTotal: Math.round(discountTotal * 100) / 100,
    subtotalProducts: netProducts,
    unaccountedAmount: unaccountedAmount > 0.004 ? unaccountedAmount : 0,
    total,
    source: "graphql",
  };
}

export async function getReceiptDetails(accessToken, transactionId, meta = {}) {
  try {
    const data = await ahGraphQL(accessToken, FETCH_POS_RECEIPT_DETAILS_QUERY, {
      id: transactionId,
    });
    const normalized = normalizeReceiptDetails(data.posReceiptDetails, meta);
    if (normalized) return normalized;
  } catch {
    // GraphQL is preferred; fall back to legacy REST when needed.
  }

  const data = await ahGet(
    accessToken,
    `/mobile-services/v2/receipts/${encodeURIComponent(transactionId)}`
  );

  if (Array.isArray(data?.receiptUiItems)) {
    const lines = data.receiptUiItems
      .filter((item) => item.type === "text" && item.value)
      .map((item) => item.value);

    return {
      transactionId,
      transactionMoment: meta.transactionMoment || data.transactionMoment || null,
      products: lines.map((line) => ({ name: line, quantity: 1, unitPrice: null, amount: 0 })),
      discounts: [],
      payments: [],
      total: meta.totalAmount ?? null,
      source: "rest-ui",
    };
  }

  throw new Error("Bonnetje kon niet worden geladen.");
}

export async function fetchReceiptPage(accessToken, { offset = 0, limit = 100 } = {}) {
  const data = await ahGraphQL(accessToken, FETCH_POS_RECEIPTS_QUERY, { offset, limit });
  return (data.posReceiptsPage?.posReceipts || []).map((receipt) => ({
    transactionId: receipt.id,
    transactionMoment: receipt.dateTime,
    totalAmount: receipt.totalAmount?.amount ?? 0,
    total: { amount: { amount: receipt.totalAmount?.amount } },
  }));
}

export async function getAllReceiptSummaries(accessToken, { maxPages = 15, pageSize = 100 } = {}) {
  const all = [];

  for (let page = 0; page < maxPages; page++) {
    const batch = await fetchReceiptPage(accessToken, {
      offset: page * pageSize,
      limit: pageSize,
    });
    all.push(...batch);
    if (batch.length < pageSize) break;
  }

  return all;
}

export async function getReceipts(accessToken) {
  try {
    return await fetchReceiptPage(accessToken, { offset: 0, limit: 100 });
  } catch {
    const data = await ahGet(accessToken, "/mobile-services/v1/receipts");
    return Array.isArray(data) ? data : [];
  }
}

export async function getAirmilesBalance(accessToken, { hasAirmilesCard = false } = {}) {
  try {
    return await ahGet(accessToken, "/mobile-services/stamps/v1/airmiles/balances");
  } catch (error) {
    if (error.status === 404) {
      if (hasAirmilesCard) {
        throw new Error(
          "Saldo niet opvraagbaar via de API. Bekijk je saldo in de AH app of op airmiles.nl."
        );
      }
      throw new Error(
        "Geen Air Miles kaart gekoppeld aan Mijn AH. Koppel je kaart in de AH app onder Profiel."
      );
    }
    throw error;
  }
}

export async function ahGet(accessToken, path, { query = {}, headers = {} } = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  });

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return ahFetch(`${path}${suffix}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-application": "AHWEBSHOP",
      ...headers,
    },
  });
}

export async function ahPatch(accessToken, path, body, { headers = {} } = {}) {
  return ahFetch(path, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-application": "AHWEBSHOP",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

export async function getShoppingList(accessToken) {
  const data = await ahGet(accessToken, "/mobile-services/shoppinglist/v2/items");
  return data?.items || [];
}

export async function patchShoppingList(accessToken, items) {
  return ahPatch(accessToken, "/mobile-services/shoppinglist/v2/items", { items });
}

export async function searchProducts(accessToken, query, page = 0) {
  const data = await ahGet(accessToken, "/mobile-services/product/search/v2", {
    query: {
      query: String(query).trim(),
      page,
      sortOn: "RELEVANCE",
    },
  });

  return {
    page: data?.page || { number: page, size: 30, totalElements: 0, totalPages: 0 },
    products: (data?.products || []).map((product) => ({
      productId: product.webshopId,
      title: product.title,
      brand: product.brand || null,
      salesUnitSize: product.salesUnitSize || null,
      price: product.priceBeforeBonus ?? null,
      image: product.images?.find((img) => img.width >= 80)?.url || product.images?.[0]?.url || null,
      category: product.mainCategory || null,
      isBonus: Boolean(product.isBonus),
    })),
  };
}

export async function ahGraphQL(accessToken, query, variables = {}) {
  const data = await ahFetch("/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ query, variables }),
  });

  if (data?.errors?.length) {
    const message = data.errors[0]?.message || "GraphQL-fout";
    const error = new Error(message);
    error.status = 400;
    throw error;
  }

  return data?.data || data;
}

const PURCHASE_STAMP_BALANCE_QUERY = `{
  purchaseStampBalance {
    points {
      currentBookletPoints
      fullBooklets
      totalPoints
    }
    money {
      invested { amount }
      interest { amount }
      payout { amount }
    }
    constants {
      price { amount }
      partialBookletTarget { points interest { amount } }
      fullBookletTarget { points interest { amount } }
    }
  }
  purchaseStampSavingGoal {
    name
    target: amount { amount }
  }
}`;

function normalizePurchaseStampBalance(data, source = "graphql") {
  const balance = data?.purchaseStampBalance || data?.balance || data;
  if (!balance?.points && !balance?.money) {
    return null;
  }

  const points = balance.points || {};
  const money = balance.money || {};
  const constants = balance.constants || {};
  const savingGoal = data?.purchaseStampSavingGoal || data?.savingGoal || null;
  const fullBookletTarget =
    points.bookletTargets?.fullBooklet ??
    constants.fullBookletTarget?.points ??
    null;

  return {
    points: {
      total: points.total ?? points.totalPoints ?? 0,
      fullBooklets: points.fullBooklets ?? 0,
      current: points.current ?? points.currentBookletPoints ?? 0,
      bookletTargets: {
        halfBooklet:
          points.bookletTargets?.halfBooklet ??
          constants.partialBookletTarget?.points ??
          null,
        fullBooklet: fullBookletTarget,
      },
    },
    money: {
      total:
        money.total ??
        money.payout?.amount ??
        (money.invested?.amount ?? 0) + (money.interest?.amount ?? 0),
      earnings: money.earnings ?? money.interest?.amount ?? 0,
      investment: money.investment ?? money.invested?.amount ?? 0,
    },
    constants: {
      stampPrice: constants.price?.amount ?? null,
      halfBookletInterest: constants.partialBookletTarget?.interest?.amount ?? null,
      fullBookletInterest: constants.fullBookletTarget?.interest?.amount ?? null,
    },
    savingGoal,
    source,
  };
}

export async function getPurchaseStampBalance(accessToken) {
  try {
    const gql = await ahGraphQL(accessToken, PURCHASE_STAMP_BALANCE_QUERY);
    const normalized = normalizePurchaseStampBalance(gql, "graphql");
    if (normalized) return normalized;
  } catch {
    // GraphQL is preferred; fall back to legacy REST when needed.
  }

  const data = await ahGet(accessToken, "/mobile-services/v1/purchase-stamps/balance", {
    headers: { "x-application": "AHWEBSHOP" },
  });
  const normalized = normalizePurchaseStampBalance(
    { purchaseStampBalance: data, purchaseStampSavingGoal: data?.savingGoal },
    "rest"
  );
  if (!normalized) {
    throw new Error("Koopzegelsaldo kon niet worden opgehaald.");
  }
  return normalized;
}

export async function getPurchaseStampTransactions(accessToken) {
  try {
    const data = await ahGet(accessToken, "/mobile-services/v1/purchase-stamps/transactions", {
      headers: { "x-application": "AHWEBSHOP" },
    });
    return Array.isArray(data?.transactions) ? data.transactions : [];
  } catch {
    return [];
  }
}

export async function activateBonusOffer(accessToken, { offerId, segmentId, startDate }) {
  const body = new URLSearchParams({
    segmentId: String(segmentId),
    startDate: String(startDate),
  });

  return ahFetch(`/mobile-services/bonuspage/v1/activate/${offerId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: body.toString(),
  });
}

export async function setMembership(accessToken, membership, enabled) {
  if (enabled) {
    const body = new URLSearchParams({ membership });
    return ahFetch("/mobile-services/member/v3/membership", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: body.toString(),
    });
  }

  const params = new URLSearchParams({ membership });
  return ahFetch(`/mobile-services/member/v3/membership?${params.toString()}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
