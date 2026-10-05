const STORAGE_KEYS = {
  accessToken: "ah_access_token",
  refreshToken: "ah_refresh_token",
};

const TAGS = [
  "Airmiles",
  "Authentication",
  "Bonus",
  "Bonus > Bonusbox",
  "Receipts",
  "Premium membership",
  "Purchase stamps",
  "Stamps",
  "AH to go",
  "Shoppinglist",
  "Track and Trace",
];

let swaggerUi = null;
let loginPopup = null;
let loginPollTimer = null;
let loginTimeoutTimer = null;
let statusPollTimer = null;
let authStatus = null;
let loginInProgress = false;

const API_TIMEOUT_MS = 30_000;
const LOGIN_POPUP_TIMEOUT_MS = 5 * 60_000;

function $(selector) {
  return document.querySelector(selector);
}

function setActivePage(pageId) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === pageId);
  });

  document.querySelectorAll(".nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });

  if (pageId === "swagger-page" && !swaggerUi) {
    initSwagger();
  }

  if (pageId === "token-wizard-page") {
    initTokenWizard();
  }

  if (pageId === "mijn-ah-page") {
    initMijnAh();
  }

  if (pageId === "financieel-page") {
    initFinancieel();
  }

  if (pageId === "lijst-page") {
    initLijst();
  }

  if (pageId === "bonus-page") {
    initBonus();
  }

  if (pageId === "koopjes-page") {
    initKoopjes();
  }

  if (pageId === "hass-page") {
    initHass();
  }

  if (!document.body.classList.contains("embed-mode")) {
    window.location.hash = pageId;
  }
}

function showLoginState(state) {
  $("#login-idle").hidden = state !== "idle";
  $("#login-loading").hidden = state !== "loading";
  $("#login-success").hidden = state !== "success";
  $("#login-error").hidden = state !== "error";
}

function setLoginLoading(text, hint) {
  showLoginState("loading");
  $("#login-loading-text").textContent = text;
  $("#login-loading-hint").textContent = hint;
}

function showLoginError(message) {
  showLoginState("error");
  $("#login-error-text").textContent = message;
}

function extractCode(input) {
  const value = input.trim();
  if (!value) return "";

  if (value.includes("code=")) {
    try {
      const url = new URL(value.replace(/^appie:\/\//, "https://"));
      return url.searchParams.get("code") || "";
    } catch {
      const match = value.match(/[?&]code=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : "";
    }
  }

  return value;
}

function syncAccessToken(accessToken) {
  if (accessToken) {
    localStorage.setItem(STORAGE_KEYS.accessToken, accessToken);
  } else {
    localStorage.removeItem(STORAGE_KEYS.accessToken);
  }

  if (swaggerUi && accessToken) {
    swaggerUi.preauthorizeApiKey("bearerAuth", accessToken);
  }
}

function persistBrowserSession(status) {
  if (!status) return;
  syncAccessToken(status.accessToken || null);
  if (status.refreshToken) {
    localStorage.setItem(STORAGE_KEYS.refreshToken, status.refreshToken);
  }
}

function clearBrowserSession() {
  localStorage.removeItem(STORAGE_KEYS.accessToken);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
}

function formatExpiry(expiresAt) {
  if (!expiresAt) return "";
  const date = new Date(expiresAt);
  return `Token geldig tot ${date.toLocaleString("nl-NL")}`;
}

function resetPageCaches() {
  const resets = [
    typeof resetMijnAhCache === "function" ? resetMijnAhCache : null,
    typeof resetFinancieelCache === "function" ? resetFinancieelCache : null,
    typeof resetLijstCache === "function" ? resetLijstCache : null,
    typeof resetKoopjesCache === "function" ? resetKoopjesCache : null,
    typeof resetBonusCache === "function" ? resetBonusCache : null,
  ];

  for (const reset of resets) {
    try {
      reset?.();
    } catch {
      /* cache-reset mag de UI niet laten crashen */
    }
  }
}

function updateUiFromStatus(status) {
  authStatus = status;
  resetPageCaches();
  if (status?.loggedIn) {
    persistBrowserSession(status);
  }
  syncAccessToken(status?.accessToken || null);

  const loggedIn = Boolean(status?.loggedIn);
  const statusHtml = loggedIn
    ? `<span class="status-pill ok"><span class="status-dot"></span> ${
        status.isAnonymous ? "Gast" : "Ingelogd"
      }</span>`
    : '<span class="status-pill warn"><span class="status-dot"></span> Niet ingelogd</span>';

  $("#token-status").innerHTML = statusHtml;
  const swaggerStatus = $("#swagger-token-status");
  if (swaggerStatus) swaggerStatus.innerHTML = statusHtml;

  $("#user-card").hidden = !loggedIn || status.isAnonymous;
  $("#login-prompt-card").hidden = loggedIn;

  if (loggedIn && !status.isAnonymous) {
    const name = status.displayName || "AH gebruiker";
    $("#user-name").textContent = name;
    $("#user-email").textContent = status.email || "";
    $("#user-expiry").textContent = formatExpiry(status.expiresAt);
    $("#user-avatar").textContent = name.charAt(0).toUpperCase();
    $("#hero-text").textContent = `Welkom terug, ${name.split(" ")[0]}! Je bent klaar om de API te verkennen.`;
  } else if (loggedIn && status.isAnonymous) {
    $("#hero-text").textContent = "Je bent ingelogd als gast. Log in met je AH-account voor persoonlijke data.";
  } else {
    $("#hero-text").textContent =
      "Log eenmalig in met je AH-account. Tokens worden automatisch opgeslagen en vernieuwd.";
  }

  if (loggedIn) {
    showLoginState("success");
    loginInProgress = false;
    $("#login-success-title").textContent = status.isAnonymous
      ? "Gastmodus actief"
      : "Ingelogd!";
    $("#login-success-text").textContent = status.isAnonymous
      ? "Je hebt een anoniem token. Sommige endpoints vereisen een echt account."
      : `${status.displayName || status.email || "Account"} — ${formatExpiry(status.expiresAt)}`;
  } else if (!loginInProgress) {
    showLoginState("idle");
  }
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Request mislukt (${response.status})`);
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Verzoek duurde te lang (timeout na 30 seconden).");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function restoreSessionOnStartup() {
  try {
    const status = await api("/api/auth/status");
    if (status.loggedIn) {
      return status;
    }
  } catch {
    /* backend nog niet klaar of geen sessie */
  }

  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
  if (!refreshToken) {
    return null;
  }

  try {
    return await api("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    clearBrowserSession();
    return null;
  }
}

async function refreshStatus() {
  try {
    const status = await api("/api/auth/status");
    updateUiFromStatus(status);
    return status;
  } catch {
    updateUiFromStatus({ loggedIn: false });
    return null;
  }
}

function stopLoginPoll() {
  if (loginPollTimer) {
    clearInterval(loginPollTimer);
    loginPollTimer = null;
  }
  if (loginTimeoutTimer) {
    clearTimeout(loginTimeoutTimer);
    loginTimeoutTimer = null;
  }
  if (loginPopup && !loginPopup.closed) {
    loginPopup.close();
  }
  loginPopup = null;
  loginInProgress = false;
}

async function completeLoginWithCode(code) {
  setLoginLoading("Tokens ophalen…", "Even geduld, we sluiten bijna af.");
  try {
    const status = await api("/api/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    stopLoginPoll();
    updateUiFromStatus(status);
  } catch (error) {
    loginInProgress = false;
    showLoginError(error.message);
    throw error;
  }
}

async function startOAuthLogin() {
  stopLoginPoll();
  loginInProgress = true;
  showLoginState("loading");

  try {
    const { url } = await api("/api/auth/login-url");
    setLoginLoading(
      "Wachten op AH-login…",
      "Voltooi het inloggen in het popup-venster. Sluit het venster niet zelf."
    );

    loginPopup = window.open(url, "ah-login", "width=520,height=760");

    if (!loginPopup) {
      throw new Error(
        "Popup geblokkeerd. Sta popups toe of gebruik het Token stappenplan."
      );
    }

    loginTimeoutTimer = setTimeout(() => {
      stopLoginPoll();
      showLoginError(
        "Inloggen duurde te lang. Gebruik het Token stappenplan om je code handmatig te plakken."
      );
    }, LOGIN_POPUP_TIMEOUT_MS);

    loginPollTimer = setInterval(async () => {
      if (!loginPopup || loginPopup.closed) {
        stopLoginPoll();
        const status = await refreshStatus();
        if (!status?.loggedIn) {
          showLoginError(
            "Het login-venster is gesloten voordat het inloggen voltooid was. Gebruik het Token stappenplan om je code te plakken."
          );
        }
        return;
      }

      try {
        const href = loginPopup.location.href;
        if (href.startsWith("appie://")) {
          const code = extractCode(href);
          stopLoginPoll();
          if (!code) {
            showLoginError("Geen autorisatiecode gevonden in de redirect.");
            return;
          }
          try {
            await completeLoginWithCode(code);
          } catch {
            // Foutmelding wordt al getoond in completeLoginWithCode.
          }
        }
      } catch {
        // Cross-origin tot de appie:// redirect — normaal gedrag.
      }
    }, 400);
  } catch (error) {
    loginInProgress = false;
    showLoginError(error.message);
  }
}

async function startGuestLogin() {
  stopLoginPoll();
  loginInProgress = true;
  setLoginLoading("Anoniem token ophalen…", "Even geduld.");
  try {
    const status = await api("/api/auth/anonymous", { method: "POST" });
    updateUiFromStatus(status);
  } catch (error) {
    loginInProgress = false;
    showLoginError(error.message);
  }
}

async function logout() {
  stopLoginPoll();
  await api("/api/auth/logout", { method: "POST" });
  clearBrowserSession();
  updateUiFromStatus({ loggedIn: false });
}

async function manualExchange() {
  const code = extractCode($("#manual-code").value);
  if (!code) {
    showLoginError("Plak een geldige code of redirect-URL.");
    return;
  }
  try {
    await completeLoginWithCode(code);
  } catch (error) {
    showLoginError(error.message);
  }
}

async function manualRefresh() {
  const refreshToken = $("#manual-refresh").value.trim();
  if (!refreshToken) {
    showLoginError("Plak eerst een refresh token.");
    return;
  }

  loginInProgress = true;
  setLoginLoading("Refresh token verwerken…", "Even geduld.");
  try {
    const status = await api("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
    updateUiFromStatus(status);
  } catch (error) {
    loginInProgress = false;
    showLoginError(error.message);
  }
}

function ensureSwaggerAssets() {
  if (!document.querySelector("#swagger-ui-css")) {
    const link = document.createElement("link");
    link.id = "swagger-ui-css";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css";
    document.head.appendChild(link);
  }
}

function initSwagger() {
  ensureSwaggerAssets();
  swaggerUi = SwaggerUIBundle({
    url: "/spec/ah-openapi.yaml",
    dom_id: "#swagger-ui",
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: "StandaloneLayout",
    validatorUrl: null,
    tryItOutEnabled: true,
    persistAuthorization: true,
    requestInterceptor: (request) => {
      const token =
        authStatus?.accessToken || localStorage.getItem(STORAGE_KEYS.accessToken);
      if (token) {
        request.headers.Authorization = `Bearer ${token}`;
      }

      if (request.url.startsWith("https://api.ah.nl/")) {
        request.url = request.url.replace("https://api.ah.nl/", "/api-proxy/");
      }

      return request;
    },
    onComplete: () => {
      const token =
        authStatus?.accessToken || localStorage.getItem(STORAGE_KEYS.accessToken);
      if (token) {
        swaggerUi.preauthorizeApiKey("bearerAuth", token);
      }
    },
  });
}

function renderTags() {
  const container = $("#tag-grid");
  if (!container) return;
  container.innerHTML = TAGS.map((tag) => `<span class="tag">${tag}</span>`).join("");
}

async function loadSpecStats() {
  try {
    const response = await fetch("/spec/ah-openapi.yaml");
    const text = await response.text();
    const pathMatches = text.match(/^\s{2}\/[^:]+:/gm) || [];
    $("#stat-endpoints").textContent = String(pathMatches.length);
    $("#stat-tags").textContent = String(TAGS.length);
    $("#stat-server").textContent = "api.ah.nl";
  } catch {
    $("#stat-endpoints").textContent = "—";
  }
}

function initNavigation() {
  document.querySelectorAll(".nav button, [data-goto]").forEach((element) => {
    element.addEventListener("click", () => {
      const pageId = element.dataset.page || element.dataset.goto;
      if (pageId) setActivePage(pageId);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("embed") === "1") {
      document.body.classList.add("embed-mode");
    }

    initNavigation();
    renderTags();
    loadSpecStats();
    bindAppEvents();

    restoreSessionOnStartup()
      .then((restored) => {
        if (restored) {
          updateUiFromStatus(restored);
          return restored;
        }
        return refreshStatus();
      })
      .catch(() => refreshStatus());

    const hashPage = window.location.hash.replace("#", "");
    if (hashPage && document.getElementById(hashPage)) {
      setActivePage(hashPage);
    }

    statusPollTimer = setInterval(refreshStatus, 60_000);
  } catch (error) {
    document.body.innerHTML = `
      <div style="padding:2rem;font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto">
        <h2>AH Explorer kon niet starten</h2>
        <p>${error.message}</p>
        <p>Probeer een harde refresh (Ctrl+F5).</p>
      </div>
    `;
  }
});

function bindAppEvents() {
  $("#start-login").addEventListener("click", startOAuthLogin);
  $("#quick-login").addEventListener("click", () => {
    setActivePage("login-page");
    startOAuthLogin();
  });
  $("#retry-login").addEventListener("click", startOAuthLogin);
  $("#cancel-login")?.addEventListener("click", () => {
    stopLoginPoll();
    showLoginError("Inloggen geannuleerd.");
  });
  $("#start-guest").addEventListener("click", startGuestLogin);
  $("#quick-guest").addEventListener("click", startGuestLogin);
  $("#login-logout").addEventListener("click", logout);
  $("#dashboard-logout").addEventListener("click", logout);
  $("#manual-exchange").addEventListener("click", manualExchange);
  $("#manual-refresh-btn").addEventListener("click", manualRefresh);
  $("#open-swagger").addEventListener("click", () => setActivePage("swagger-page"));
  $("#open-mijn-ah")?.addEventListener("click", () => setActivePage("mijn-ah-page"));
  $("#quick-mijn-ah")?.addEventListener("click", () => setActivePage("mijn-ah-page"));
  $("#quick-wizard").addEventListener("click", () => setActivePage("token-wizard-page"));
  $("#goto-wizard").addEventListener("click", () => setActivePage("token-wizard-page"));
  $("#wizard-reset")?.addEventListener("click", resetTokenWizard);
}
