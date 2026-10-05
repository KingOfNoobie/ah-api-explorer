import express from "express";
import {
  exchangeCode,
  getAnonymousToken,
  getLoginUrl,
  getMember,
  getReceiptDetails,
  refreshTokens,
} from "./ah-client.js";
import { clearSession, loadSession, saveSession } from "./session-store.js";
import { fetchDashboard } from "./dashboard.js";
import { fetchFinancialMonth, fetchFinancialMonths } from "./financial.js";
import { activateAllActivatable, activateOffer } from "./actions.js";
import {
  addProductToList,
  changeListItemQuantity,
  fetchProductSearch,
  fetchShoppingList,
  removeListItem,
  toggleListItemStrike,
} from "./shopping-list.js";
import { fetchPreviouslyBought } from "./previously-bought.js";
import {
  fetchBargainContext,
  fetchBargainsForStore,
  searchStoresByPostalCode,
} from "./bargains.js";
import { fetchBonusSection, fetchBonusCatalog } from "./bonus.js";
import { fetchProductDetail } from "./products.js";
import { createHacsZipStream, getHacsInfo } from "./hacs-pack.js";

const app = express();
const PORT = process.env.PORT || 3001;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

function expiresAtFromNow(expiresIn) {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function publicStatus(session) {
  const loggedIn = Boolean(session.accessToken);
  const name = session.member?.name;
  const displayName = name
    ? [name.firstName, name.middleName, name.surname].filter(Boolean).join(" ")
    : null;

  return {
    loggedIn,
    isAnonymous: session.isAnonymous,
    expiresAt: session.expiresAt,
    memberId: session.member?.memberId || null,
    email: session.member?.email || null,
    displayName,
    hasRefreshToken: Boolean(session.refreshToken),
    updatedAt: session.updatedAt,
  };
}

function authResponse(session) {
  return {
    ...publicStatus(session),
    accessToken: session.accessToken || null,
    refreshToken: session.refreshToken || null,
  };
}

async function applyTokens(tokens, { isAnonymous = false } = {}) {
  const session = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || "",
    expiresAt: expiresAtFromNow(tokens.expiresIn),
    isAnonymous,
    member: null,
  };

  if (!isAnonymous && tokens.accessToken) {
    try {
      session.member = await getMember(tokens.accessToken);
    } catch {
      session.member = null;
    }
  }

  return saveSession(session);
}

async function ensureFreshSession() {
  const session = await loadSession();
  if (!session.accessToken || !session.expiresAt) {
    return session;
  }

  const expiresMs = new Date(session.expiresAt).getTime();
  const shouldRefresh =
    session.refreshToken && expiresMs - Date.now() < REFRESH_MARGIN_MS;

  if (!shouldRefresh) {
    return session;
  }

  try {
    const tokens = await refreshTokens(session.refreshToken);
    return applyTokens(tokens, { isAnonymous: session.isAnonymous });
  } catch {
    return session;
  }
}

app.get("/api/auth/login-url", (_req, res) => {
  res.json({ url: getLoginUrl() });
});

app.get("/api/auth/status", async (_req, res) => {
  try {
    const session = await ensureFreshSession();
    res.json(authResponse(session));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/anonymous", async (_req, res) => {
  try {
    const tokens = await getAnonymousToken();
    const session = await applyTokens(tokens, { isAnonymous: true });
    res.json(authResponse(session));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/auth/exchange", async (req, res) => {
  const code = String(req.body?.code || "").trim();
  if (!code) {
    return res.status(400).json({ error: "Geen autorisatiecode ontvangen." });
  }

  try {
    const tokens = await exchangeCode(code);
    const session = await applyTokens(tokens, { isAnonymous: false });
    res.json(authResponse(session));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/auth/refresh", async (req, res) => {
  try {
    const current = await loadSession();
    const refreshToken = String(req.body?.refreshToken || current.refreshToken || "").trim();

    if (!refreshToken) {
      return res.status(400).json({ error: "Geen refresh token beschikbaar." });
    }

    const tokens = await refreshTokens(refreshToken);
    const session = await applyTokens(tokens, {
      isAnonymous: req.body?.refreshToken ? false : current.isAnonymous,
    });
    res.json(authResponse(session));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/dashboard", async (_req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!session.accessToken) {
      return res.status(401).json({ error: "Niet ingelogd. Log eerst in." });
    }
    if (session.isAnonymous) {
      return res.status(403).json({
        error: "Gastaccounts hebben geen toegang tot persoonlijke gegevens.",
      });
    }

    const dashboard = await fetchDashboard(session.accessToken);
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/receipts/:transactionId", async (req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!session.accessToken) {
      return res.status(401).json({ error: "Niet ingelogd. Log eerst in." });
    }
    if (session.isAnonymous) {
      return res.status(403).json({ error: "Gastaccounts hebben geen toegang tot bonnetjes." });
    }

    const transactionId = String(req.params.transactionId || "").trim();
    if (!transactionId) {
      return res.status(400).json({ error: "Geen bonnetje-ID opgegeven." });
    }

    const receipt = await getReceiptDetails(session.accessToken, transactionId, {
      transactionMoment: req.query.date || null,
      totalAmount: req.query.total ? Number(req.query.total) : null,
      stampPrice: req.query.stampPrice ? Number(req.query.stampPrice) : 0.1,
    });
    res.json(receipt);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/financial/months", async (_req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!session.accessToken) {
      return res.status(401).json({ error: "Niet ingelogd. Log eerst in." });
    }
    if (session.isAnonymous) {
      return res.status(403).json({ error: "Gastaccounts hebben geen toegang tot financiële gegevens." });
    }

    const data = await fetchFinancialMonths(session.accessToken);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/financial/month", async (req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!session.accessToken) {
      return res.status(401).json({ error: "Niet ingelogd. Log eerst in." });
    }
    if (session.isAnonymous) {
      return res.status(403).json({ error: "Gastaccounts hebben geen toegang tot financiële gegevens." });
    }

    const month = String(req.query.month || "").trim();
    if (!month) {
      return res.status(400).json({ error: "Geef een maand op (YYYY-MM)." });
    }

    const data = await fetchFinancialMonth(session.accessToken, month);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

function requireLoggedInMember(session, res) {
  if (!session.accessToken) {
    res.status(401).json({ error: "Niet ingelogd. Log eerst in." });
    return false;
  }
  if (session.isAnonymous) {
    res.status(403).json({ error: "Gastaccounts hebben geen toegang tot deze functie." });
    return false;
  }
  return true;
}

app.get("/api/shopping-list", async (_req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!requireLoggedInMember(session, res)) return;

    const data = await fetchShoppingList(session.accessToken);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/shopping-list/search", async (req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!requireLoggedInMember(session, res)) return;

    const query = String(req.query.q || "").trim();
    const page = req.query.page ? Number(req.query.page) : 0;
    const data = await fetchProductSearch(session.accessToken, query, page);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/shopping-list/add", async (req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!requireLoggedInMember(session, res)) return;

    const productId = Number(req.body?.productId);
    const quantity = req.body?.quantity ? Number(req.body.quantity) : 1;
    if (!productId) {
      return res.status(400).json({ error: "productId is verplicht." });
    }

    const data = await addProductToList(session.accessToken, productId, quantity);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.patch("/api/shopping-list/items", async (req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!requireLoggedInMember(session, res)) return;

    const item = req.body?.item;
    const action = String(req.body?.action || "").trim();
    if (!item) {
      return res.status(400).json({ error: "item is verplicht." });
    }

    let data;
    if (action === "remove") {
      data = await removeListItem(session.accessToken, item);
    } else if (action === "toggle") {
      data = await toggleListItemStrike(session.accessToken, item);
    } else if (action === "quantity") {
      data = await changeListItemQuantity(
        session.accessToken,
        item,
        Number(req.body?.quantity ?? item.quantity)
      );
    } else {
      return res.status(400).json({ error: "Onbekende actie." });
    }

    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/previously-bought", async (req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!requireLoggedInMember(session, res)) return;

    const data = await fetchPreviouslyBought(session.accessToken, {
      receiptLimit: req.query.receiptLimit ? Number(req.query.receiptLimit) : 50,
      productLimit: req.query.limit ? Number(req.query.limit) : 30,
    });
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/bargains/context", async (_req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!requireLoggedInMember(session, res)) return;

    const data = await fetchBargainContext(session.accessToken);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/bargains/stores", async (req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!requireLoggedInMember(session, res)) return;

    const postalCode = String(req.query.postalCode || "").trim();
    if (!postalCode) {
      return res.status(400).json({ error: "postalCode is verplicht." });
    }

    const data = await searchStoresByPostalCode(session.accessToken, postalCode);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/bargains", async (req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!requireLoggedInMember(session, res)) return;

    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) {
      return res.status(400).json({ error: "storeId is verplicht." });
    }

    const data = await fetchBargainsForStore(session.accessToken, storeId);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/bonus/catalog", async (_req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!requireLoggedInMember(session, res)) return;

    const data = await fetchBonusCatalog(session.accessToken);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/bonus/section", async (req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!requireLoggedInMember(session, res)) return;

    const category = String(req.query.category || "").trim();
    const promotionType = String(req.query.promotionType || "").trim();
    const date = String(req.query.date || "").trim() || undefined;

    if (!category && !promotionType) {
      return res.status(400).json({ error: "category of promotionType is verplicht." });
    }

    const data = await fetchBonusSection(session.accessToken, {
      category: category || undefined,
      promotionType: promotionType || undefined,
      date,
    });
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/products/:productId", async (req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!requireLoggedInMember(session, res)) return;

    const productId = String(req.params.productId || "").trim();
    if (!productId) {
      return res.status(400).json({ error: "productId is verplicht." });
    }

    const data = await fetchProductDetail(session.accessToken, productId);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/actions/bonus/activate", async (req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!session.accessToken || session.isAnonymous) {
      return res.status(401).json({ error: "Inloggen vereist." });
    }

    const dashboard = await fetchDashboard(session.accessToken);
    if ((dashboard.bonusbox?.remainingActivations ?? 1) <= 0) {
      return res.status(400).json({
        error: `Bonuslimiet bereikt (${dashboard.bonusbox?.maxActivations ?? 5} per week).`,
      });
    }

    const result = await activateOffer(session.accessToken, {
      offerId: req.body?.offerId,
      segmentId: req.body?.segmentId,
      startDate: req.body?.startDate,
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/actions/bonus/activate-all", async (req, res) => {
  try {
    const session = await ensureFreshSession();
    if (!session.accessToken || session.isAnonymous) {
      return res.status(401).json({ error: "Inloggen vereist." });
    }

    const source = req.body?.source === "personalBonus" ? "personalBonus" : "bonusbox";
    const result = await activateAllActivatable(session.accessToken, source);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/auth/logout", async (_req, res) => {
  await clearSession();
  res.json({ loggedIn: false });
});

app.get("/api/hacs/info", (_req, res) => {
  try {
    const info = getHacsInfo();
    const host = _req.get("host") || "localhost:38472";
    const proto = _req.get("x-forwarded-proto") || "http";
    res.json({
      ...info,
      downloadUrl: `${proto}://${host}/api/hacs/download`,
      cardUrl: `${proto}://${host}/hacs/www/ah-explorer-card.js`,
      explorerUrl: `${proto}://${host}`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/hacs/download", (_req, res) => {
  try {
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="albert-heijn-explorer-hacs.zip"'
    );
    createHacsZipStream().pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

setInterval(() => {
  ensureFreshSession().catch(() => {});
}, 60_000);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AH auth backend listening on 0.0.0.0:${PORT}`);
});
