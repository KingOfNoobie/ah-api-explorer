const BONUS_PROMOTION_API = {
  etos: "ETOS",
  gall: "GALL",
  gallcard: "GALLCARD",
  ahonline: "AHONLINE",
};

let productModalOpen = false;
let productModalBusy = false;

function escapeHtmlProduct(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatMoneyProduct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value));
}

function ensureProductModal() {
  let modal = document.querySelector("#product-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "product-modal";
  modal.className = "product-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="product-modal-backdrop" data-close-product></div>
    <div class="product-modal-panel card" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
      <button type="button" class="product-modal-close" data-close-product aria-label="Sluiten">✕</button>
      <div id="product-modal-body"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll("[data-close-product]").forEach((element) => {
    element.addEventListener("click", closeProductDetail);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && productModalOpen) {
      closeProductDetail();
    }
  });

  return modal;
}

function showProductToast(message) {
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

function renderProductDetailContent(product) {
  const image = product.image
    ? `<img src="${escapeHtmlProduct(product.image)}" alt="${escapeHtmlProduct(product.title)}" class="product-modal-image" />`
    : `<div class="product-modal-image placeholder">?</div>`;

  const priceBlock =
    product.bonusPrice && product.priceBeforeBonus && product.bonusPrice < product.priceBeforeBonus
      ? `<div class="product-modal-prices">
          <span class="koopjes-was">${formatMoneyProduct(product.priceBeforeBonus)}</span>
          <strong class="product-modal-price bonus">${formatMoneyProduct(product.bonusPrice)}</strong>
          <span class="product-modal-bonus-badge">Bonus</span>
        </div>`
      : `<div class="product-modal-prices">
          <strong class="product-modal-price">${formatMoneyProduct(product.price)}</strong>
          ${product.isBonus ? `<span class="product-modal-bonus-badge">Bonus</span>` : ""}
        </div>`;

  const bonusLabel = product.bonusLabel
    ? `<p class="product-modal-bonus-label">${escapeHtmlProduct(product.bonusLabel)}</p>`
    : "";

  const activateButton = product.activatable
    ? `<button type="button" class="btn btn-primary btn-small" id="product-activate-bonus" data-offer-id="${escapeHtmlProduct(product.offerId)}" data-segment-id="${escapeHtmlProduct(product.segmentId)}" data-start-date="${escapeHtmlProduct(product.startDate)}" ${productModalBusy ? "disabled" : ""}>Bonus activeren</button>`
    : product.activated
      ? `<span class="muted offer-done">✓ Bonus actief</span>`
      : "";

  const nutrients =
    product.nutrients?.length
      ? `<section class="product-modal-section">
          <h4>Voedingswaarden</h4>
          <ul class="product-nutrient-list">
            ${product.nutrients
              .map(
                (item) => `
              <li>
                <span>${escapeHtmlProduct(item.name)}</span>
                <strong>${escapeHtmlProduct(String(item.value))}${item.unit ? ` ${escapeHtmlProduct(item.unit)}` : ""}</strong>
              </li>
            `
              )
              .join("")}
          </ul>
        </section>`
      : "";

  const allergens = product.allergens?.length
    ? `<section class="product-modal-section">
        <h4>Allergenen</h4>
        <p>${product.allergens.map(escapeHtmlProduct).join(" · ")}</p>
      </section>`
    : "";

  const description = product.descriptionText
    ? `<section class="product-modal-section">
        <h4>Omschrijving</h4>
        <p>${escapeHtmlProduct(product.descriptionText)}</p>
      </section>`
    : "";

  const ingredients = product.ingredients
    ? `<section class="product-modal-section">
        <h4>Ingrediënten</h4>
        <p>${escapeHtmlProduct(product.ingredients)}</p>
      </section>`
    : "";

  const meta = [
    product.brand,
    product.salesUnitSize,
    product.mainCategory,
    product.subCategory,
  ]
    .filter(Boolean)
    .map(escapeHtmlProduct)
    .join(" · ");

  return `
    <div class="product-modal-grid">
      ${image}
      <div class="product-modal-main">
        <h3 id="product-modal-title">${escapeHtmlProduct(product.title)}</h3>
        ${meta ? `<p class="muted">${meta}</p>` : ""}
        ${priceBlock}
        ${bonusLabel}
        ${product.unitPriceDescription ? `<p class="muted">${escapeHtmlProduct(product.unitPriceDescription)}</p>` : ""}
        <div class="product-modal-actions">
          <button type="button" class="btn btn-primary" id="product-add-list" data-product-id="${escapeHtmlProduct(String(product.productId))}" data-title="${escapeHtmlProduct(product.title)}" ${productModalBusy ? "disabled" : ""}>+ Op lijst</button>
          ${activateButton}
        </div>
      </div>
    </div>
    ${description}
    ${ingredients}
    ${allergens}
    ${nutrients}
    ${
      product.storageInstructions || product.usageInstructions || product.alcoholPercentage
        ? `<section class="product-modal-section">
            <h4>Extra info</h4>
            ${product.storageInstructions ? `<p><span class="muted">Bewaren:</span> ${escapeHtmlProduct(product.storageInstructions)}</p>` : ""}
            ${product.usageInstructions ? `<p><span class="muted">Gebruik:</span> ${escapeHtmlProduct(product.usageInstructions)}</p>` : ""}
            ${product.alcoholPercentage ? `<p><span class="muted">Alcohol:</span> ${escapeHtmlProduct(String(product.alcoholPercentage))}%</p>` : ""}
            ${product.gtin ? `<p class="muted">Barcode: ${escapeHtmlProduct(product.gtin)}</p>` : ""}
          </section>`
        : ""
    }
    ${product.disclaimer ? `<p class="muted product-modal-disclaimer">${escapeHtmlProduct(product.disclaimer)}</p>` : ""}
  `;
}

function bindProductModalActions(product) {
  const modal = document.querySelector("#product-modal");
  if (!modal) return;

  modal.querySelector("#product-add-list")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (productModalBusy || !product.productId) return;

    productModalBusy = true;
    button.disabled = true;
    const originalText = button.textContent;

    try {
      await api("/api/shopping-list/add", {
        method: "POST",
        body: JSON.stringify({ productId: Number(product.productId), quantity: 1 }),
      });
      showProductToast(`${product.title} op je lijst gezet`);
      button.textContent = "✓ Op lijst";
      if (typeof resetLijstCache === "function") resetLijstCache();
    } catch (error) {
      showProductToast(error.message);
      button.disabled = false;
      button.textContent = originalText;
    } finally {
      productModalBusy = false;
    }
  });

  modal.querySelector("#product-activate-bonus")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (productModalBusy) return;

    productModalBusy = true;
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
      showProductToast("Bonus geactiveerd");
      await openProductDetail(product.productId, true);
    } catch (error) {
      showProductToast(error.message);
      button.disabled = false;
      button.textContent = originalText;
    } finally {
      productModalBusy = false;
    }
  });
}

function closeProductDetail() {
  const modal = document.querySelector("#product-modal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("product-modal-open");
  productModalOpen = false;
}

async function openProductDetail(productId, force = false) {
  if (!productId) return;

  if (!authStatus?.loggedIn || authStatus?.isAnonymous) {
    setActivePage("login-page");
    return;
  }

  const modal = ensureProductModal();
  const body = modal.querySelector("#product-modal-body");

  modal.hidden = false;
  document.body.classList.add("product-modal-open");
  productModalOpen = true;

  body.innerHTML = `
    <div class="loading-box" style="padding:2rem">
      <div class="spinner"></div>
      <strong>Product laden…</strong>
    </div>
  `;

  try {
    const data = await api(`/api/products/${encodeURIComponent(productId)}${force ? "?t=1" : ""}`);
    const product = data.product;
    body.innerHTML = renderProductDetailContent(product);
    bindProductModalActions(product);
  } catch (error) {
    body.innerHTML = `
      <div class="mijn-ah-error">
        <strong>Product laden mislukt</strong>
        <p class="muted">${escapeHtmlProduct(error.message)}</p>
        <button type="button" class="btn btn-secondary btn-small" data-close-product>Sluiten</button>
      </div>
    `;
    body.querySelector("[data-close-product]")?.addEventListener("click", closeProductDetail);
  }
}

function bindProductOpenButtons(root = document) {
  root.querySelectorAll(".product-open-btn, [data-product-open]").forEach((button) => {
    if (button.dataset.productBound === "1") return;
    button.dataset.productBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openProductDetail(button.dataset.productId || button.dataset.productOpen);
    });
  });
}

function initProductModal() {
  ensureProductModal();
}

document.addEventListener("DOMContentLoaded", initProductModal);
