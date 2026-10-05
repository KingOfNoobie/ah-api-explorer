let bonusLoaded = false;
let bonusCatalog = null;
let bonusSection = null;
let bonusMode = "category";
let bonusCategoryId = "";
let bonusPromotionId = "etos";
let bonusBusy = false;

const BONUS_PROMOTION_API = {
  etos: "ETOS",
  gall: "GALL",
  gallcard: "GALLCARD",
  ahonline: "AHONLINE",
};

function escapeHtmlBonus(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatShortDateBonus(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function showBonusToast(message) {
  let toast = document.querySelector(".wizard-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "wizard-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

function renderBonusLoading(message) {
  const container = document.querySelector("#bonus-content");
  if (!container) return;
  container.innerHTML = `
    <div class="loading-box card" style="padding:2rem">
      <div class="spinner"></div>
      <strong>${escapeHtmlBonus(message)}</strong>
    </div>
  `;
}

function renderBonusLoginPrompt() {
  const container = document.querySelector("#bonus-content");
  if (!container) return;

  const isGuest = authStatus?.loggedIn && authStatus?.isAnonymous;
  container.innerHTML = `
    <div class="card" style="padding:2rem">
      <h3>${isGuest ? "Gastmodus actief" : "Nog niet ingelogd"}</h3>
      <p class="muted" style="margin:0.75rem 0 1rem">
        Log in om bonus per categorie te bekijken.
      </p>
      <button type="button" class="btn btn-primary" data-goto="login-page">Inloggen</button>
    </div>
  `;
  container.querySelector("[data-goto]")?.addEventListener("click", () => {
    setActivePage("login-page");
  });
}

function renderBonusOfferCard(offer) {
  const image = offer.image
    ? `<img src="${escapeHtmlBonus(offer.image)}" alt="" class="offer-image" loading="lazy" />`
    : `<div class="offer-image placeholder">%</div>`;

  const activateButton = offer.activatable
    ? `<button type="button" class="btn btn-primary btn-small bonus-activate-btn" data-offer-id="${escapeHtmlBonus(offer.offerId)}" data-segment-id="${escapeHtmlBonus(offer.segmentId)}" data-start-date="${escapeHtmlBonus(offer.startDate)}" data-title="${escapeHtmlBonus(offer.title)}" ${bonusBusy ? "disabled" : ""}>Activeren</button>`
    : offer.activated
      ? `<span class="muted offer-done">✓ Actief</span>`
      : "";

  const productButton = offer.productId
    ? `<button type="button" class="btn btn-ghost btn-small product-open-btn" data-product-id="${escapeHtmlBonus(String(offer.productId))}">Product</button>`
    : "";

  return `
    <article class="offer-card ${offer.activated ? "offer-activated" : ""}">
      ${image}
      <div class="offer-body">
        <div class="offer-top">
          <strong>${escapeHtmlBonus(offer.title)}</strong>
          ${offer.activated ? `<span class="offer-status active">GEACTIVEERD</span>` : ""}
        </div>
        ${offer.discount ? `<p class="offer-discount">${escapeHtmlBonus(offer.discount)}</p>` : ""}
        ${offer.subtitle ? `<p class="muted">${escapeHtmlBonus(offer.subtitle)}</p>` : ""}
        <p class="offer-meta muted">
          ${[offer.category, offer.period].filter(Boolean).map(escapeHtmlBonus).join(" · ")}
        </p>
        <div class="offer-actions">${activateButton}${productButton}</div>
      </div>
    </article>
  `;
}

function renderBonusResultsHtml() {
  const offers = bonusSection?.offers || [];
  if (!offers.length) {
    return `<p class="muted">Geen aanbiedingen gevonden voor deze selectie.</p>`;
  }
  return `<div class="offer-grid">${offers.map(renderBonusOfferCard).join("")}</div>`;
}

function renderBonusShell({ loadingSection = false, sectionError = null } = {}) {
  const container = document.querySelector("#bonus-content");
  if (!container || !bonusCatalog) return;

  const categories = bonusCatalog.categories || [];
  const promotionTypes = bonusCatalog.promotionTypes || [];
  const offers = bonusSection?.offers || [];

  if (!bonusCategoryId && categories.length) {
    bonusCategoryId = categories[0].id;
  }

  const modeTabs = `
    <div class="bonus-mode-tabs" role="tablist">
      <button type="button" class="bonus-mode-tab${bonusMode === "category" ? " active" : ""}" data-mode="category">AH categorieën</button>
      <button type="button" class="bonus-mode-tab${bonusMode === "promotion" ? " active" : ""}" data-mode="promotion">Etos / Gall / Online</button>
    </div>
  `;

  const categoryChips =
    bonusMode === "category"
      ? `<div class="bonus-category-chips">
          ${categories
            .map(
              (category) => `
            <button
              type="button"
              class="koopjes-chip${bonusCategoryId === category.id ? " active" : ""}"
              data-category-id="${escapeHtmlBonus(category.id)}"
            >
              ${escapeHtmlBonus(category.label)}
            </button>
          `
            )
            .join("")}
        </div>`
      : `<div class="bonus-category-chips">
          ${promotionTypes
            .map(
              (promotion) => `
            <button
              type="button"
              class="koopjes-chip${bonusPromotionId === promotion.id ? " active" : ""}"
              data-promotion-id="${escapeHtmlBonus(promotion.id)}"
            >
              ${escapeHtmlBonus(promotion.label)}
            </button>
          `
            )
            .join("")}
        </div>`;

  const resultsContent = loadingSection
    ? `<div class="loading-box" style="padding:2rem"><div class="spinner"></div><strong>Bonus laden…</strong></div>`
    : sectionError
      ? `<div class="mijn-ah-error"><strong>Bonus laden mislukt</strong><p class="muted">${escapeHtmlBonus(sectionError)}</p><button type="button" class="btn btn-secondary btn-small" id="retry-bonus-section">Opnieuw proberen</button></div>`
      : renderBonusResultsHtml();

  const weekLabel = bonusCatalog.bonusEndDate
    ? `${formatShortDateBonus(bonusCatalog.bonusWeek)} t/m ${formatShortDateBonus(bonusCatalog.bonusEndDate)}`
    : formatShortDateBonus(bonusCatalog.bonusWeek);

  container.innerHTML = `
    <div class="hero fin-hero bonus-hero">
      <div>
        <h2>Bonus per categorie</h2>
        <p>Alle weekaanbiedingen per schap — live uit de AH bonusfolder.</p>
        <p class="muted">Bonusweek ${escapeHtmlBonus(weekLabel)}</p>
        ${
          bonusCatalog.bonusFolderUrl
            ? `<p><a class="mini-link" href="${escapeHtmlBonus(bonusCatalog.bonusFolderUrl)}" target="_blank" rel="noopener">Open bonusfolder</a></p>`
            : ""
        }
      </div>
      <button type="button" class="btn btn-secondary btn-small" id="refresh-bonus">Vernieuwen</button>
    </div>

    <section class="card bonus-toolbar">
      ${modeTabs}
      ${categoryChips}
      <p class="muted bonus-result-meta">
        ${
          loadingSection
            ? "Aanbiedingen ophalen…"
            : sectionError
              ? "Kon aanbiedingen niet laden"
              : bonusSection
                ? `${offers.length} aanbieding${offers.length === 1 ? "" : "en"} · ${escapeHtmlBonus(bonusSection.title)}`
                : ""
        }
      </p>
    </section>

    <section class="card bonus-results" id="bonus-results">
      ${resultsContent}
    </section>
  `;

  container.querySelector("#refresh-bonus")?.addEventListener("click", () => loadBonus(true));
  container.querySelector("#retry-bonus-section")?.addEventListener("click", () => loadBonusSection());
  bindBonusShellEvents(container);
}

function bindBonusResultActions(root) {
  root.querySelectorAll(".bonus-activate-btn").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => activateBonusOffer(button));
  });

  bindProductOpenButtons(root);
}

function bindBonusShellEvents(container) {
  container.querySelectorAll(".bonus-mode-tab").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => {
      bonusMode = button.dataset.mode || "category";
      loadBonusSection();
    });
  });

  container.querySelectorAll("[data-category-id]").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => {
      bonusCategoryId = button.dataset.categoryId;
      loadBonusSection();
    });
  });

  container.querySelectorAll("[data-promotion-id]").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => {
      bonusPromotionId = button.dataset.promotionId;
      loadBonusSection();
    });
  });

  bindBonusResultActions(container);
}

async function activateBonusOffer(button) {
  if (bonusBusy) return;

  bonusBusy = true;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Bezig…";

  try {
    await api("/api/actions/bonus/activate", {
      method: "POST",
      body: JSON.stringify({
        offerId: button.dataset.offerId,
        segmentId: button.dataset.segmentId,
        startDate: button.dataset.startDate,
      }),
    });
    showBonusToast(`${button.dataset.title || "Aanbieding"} geactiveerd`);
    await loadBonusSection();
  } catch (error) {
    showBonusToast(error.message);
    button.disabled = false;
    button.textContent = originalText;
  } finally {
    bonusBusy = false;
  }
}

function buildBonusSectionParams() {
  const params = new URLSearchParams();

  if (bonusMode === "promotion") {
    const promotion = bonusCatalog.promotionTypes.find((entry) => entry.id === bonusPromotionId);
    params.set(
      "promotionType",
      promotion?.bonusType || BONUS_PROMOTION_API[bonusPromotionId] || "ETOS"
    );
  } else {
    const category = bonusCatalog.categories.find((entry) => entry.id === bonusCategoryId);
    params.set("category", category?.label || bonusCatalog.categories[0]?.label || "");
  }

  if (bonusCatalog.bonusWeek) {
    params.set("date", bonusCatalog.bonusWeek);
  }

  return params;
}

async function loadBonusSection() {
  if (!bonusCatalog) return;

  renderBonusShell({ loadingSection: true });

  try {
    bonusSection = await api(`/api/bonus/section?${buildBonusSectionParams().toString()}`);
    renderBonusShell();
  } catch (error) {
    renderBonusShell({ sectionError: error.message });
  }
}

async function loadBonus(force = false) {
  if (!authStatus?.loggedIn || authStatus?.isAnonymous) {
    renderBonusLoginPrompt();
    return;
  }

  if (bonusLoaded && !force) return;

  renderBonusLoading("Bonuscatalogus laden…");

  try {
    bonusCatalog = await api("/api/bonus/catalog");
    if (!bonusCategoryId && bonusCatalog.categories?.length) {
      bonusCategoryId = bonusCatalog.categories[0].id;
    }
    if (!bonusPromotionId && bonusCatalog.promotionTypes?.length) {
      bonusPromotionId = bonusCatalog.promotionTypes[0].id;
    }

    await loadBonusSection();
    bonusLoaded = true;
  } catch (error) {
    document.querySelector("#bonus-content").innerHTML = `
      <div class="mijn-ah-error card">
        <strong>Bonus kon niet worden geladen</strong>
        <p class="muted">${escapeHtmlBonus(error.message)}</p>
        <button type="button" class="btn btn-secondary" id="retry-bonus">Opnieuw proberen</button>
      </div>
    `;
    document.querySelector("#retry-bonus")?.addEventListener("click", () => {
      bonusLoaded = false;
      loadBonus(true);
    });
  }
}

function initBonus() {
  loadBonus();
}

function resetBonusCache() {
  bonusLoaded = false;
  bonusCatalog = null;
  bonusSection = null;
  bonusCategoryId = "";
}
