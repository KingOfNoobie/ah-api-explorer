let lijstLoaded = false;
let lijstItems = [];
let lijstSearchTimer = null;
let lijstBusy = false;

function escapeHtmlLijst(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatMoneyLijst(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value));
}

function formatShortDateLijst(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function showLijstToast(message) {
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

function renderLijstLoading(message) {
  const container = document.querySelector("#lijst-content");
  if (!container) return;
  container.innerHTML = `
    <div class="loading-box card" style="padding:2rem">
      <div class="spinner"></div>
      <strong>${escapeHtmlLijst(message)}</strong>
    </div>
  `;
}

function renderLijstLoginPrompt() {
  const container = document.querySelector("#lijst-content");
  if (!container) return;

  const isGuest = authStatus?.loggedIn && authStatus?.isAnonymous;
  container.innerHTML = `
    <div class="card" style="padding:2rem">
      <h3>${isGuest ? "Gastmodus actief" : "Nog niet ingelogd"}</h3>
      <p class="muted" style="margin:0.75rem 0 1rem">
        Log in om je boodschappenlijst te beheren.
      </p>
      <button type="button" class="btn btn-primary" data-goto="login-page">Inloggen</button>
    </div>
  `;
  bindLijstGotoButtons(container);
}

function renderListItemRow(item) {
  const checked = item.strikedthrough ? "checked" : "";
  const doneClass = item.strikedthrough ? "lijst-item-done" : "";

  return `
    <li class="lijst-item ${doneClass}" data-list-item-id="${escapeHtmlLijst(String(item.listItemId ?? ""))}">
      <label class="lijst-check">
        <input type="checkbox" class="lijst-toggle" ${checked} ${lijstBusy ? "disabled" : ""} />
        <span class="lijst-check-ui"></span>
      </label>
      ${item.image ? `<img src="${escapeHtmlLijst(item.image)}" alt="" class="list-thumb" loading="lazy" />` : ""}
      <div class="lijst-item-body">
        ${
          item.productId
            ? `<button type="button" class="lijst-product-link product-open-btn" data-product-id="${escapeHtmlLijst(String(item.productId))}"><strong>${escapeHtmlLijst(item.title)}</strong></button>`
            : `<strong>${escapeHtmlLijst(item.title)}</strong>`
        }
        <p class="muted">${item.salesUnitSize ? escapeHtmlLijst(item.salesUnitSize) : ""}${item.price ? ` · ${formatMoneyLijst(item.price)}` : ""}</p>
      </div>
      <div class="lijst-item-actions">
        <div class="lijst-qty">
          <button type="button" class="btn btn-ghost btn-small lijst-qty-btn" data-delta="-1" ${lijstBusy ? "disabled" : ""}>−</button>
          <span>${escapeHtmlLijst(String(item.quantity))}</span>
          <button type="button" class="btn btn-ghost btn-small lijst-qty-btn" data-delta="1" ${lijstBusy ? "disabled" : ""}>+</button>
        </div>
        <button type="button" class="btn btn-ghost btn-small lijst-remove" ${lijstBusy ? "disabled" : ""} title="Verwijderen">✕</button>
      </div>
    </li>
  `;
}

function renderSearchResult(product) {
  return `
    <li class="lijst-search-item">
      ${product.image ? `<img src="${escapeHtmlLijst(product.image)}" alt="" class="list-thumb product-open-btn" data-product-id="${escapeHtmlLijst(String(product.productId))}" role="button" tabindex="0" />` : ""}
      <div class="lijst-search-body">
        <button type="button" class="lijst-product-link product-open-btn" data-product-id="${escapeHtmlLijst(String(product.productId))}">
          <strong>${escapeHtmlLijst(product.title)}</strong>
        </button>
        <p class="muted">
          ${[product.brand, product.salesUnitSize].filter(Boolean).map(escapeHtmlLijst).join(" · ")}
          ${product.price ? ` · ${formatMoneyLijst(product.price)}` : ""}
          ${product.isBonus ? " · <span class='lijst-bonus-tag'>Bonus</span>" : ""}
        </p>
      </div>
      <button
        type="button"
        class="btn btn-primary btn-small lijst-add-btn"
        data-product-id="${escapeHtmlLijst(String(product.productId))}"
        data-title="${escapeHtmlLijst(product.title)}"
        ${lijstBusy ? "disabled" : ""}
      >
        + Lijst
      </button>
    </li>
  `;
}

function renderPreviouslyBoughtItem(product) {
  const canAdd = Boolean(product.productId);
  return `
    <li class="lijst-prev-item">
      <div>
        <strong>${escapeHtmlLijst(product.name)}</strong>
        <p class="muted">
          ${product.purchaseCount}× gekocht · laatst ${formatShortDateLijst(product.lastPurchased)}
        </p>
      </div>
      ${
        canAdd
          ? `<div class="lijst-prev-actions">
              <button
                type="button"
                class="btn btn-ghost btn-small product-open-btn"
                data-product-id="${escapeHtmlLijst(String(product.productId))}"
              >
                Details
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-small lijst-add-btn"
                data-product-id="${escapeHtmlLijst(String(product.productId))}"
                data-title="${escapeHtmlLijst(product.name)}"
                ${lijstBusy ? "disabled" : ""}
              >
                + Lijst
              </button>
            </div>`
          : `<span class="muted">Geen product-ID</span>`
      }
    </li>
  `;
}

function renderLijstShell(previouslyBought = []) {
  const container = document.querySelector("#lijst-content");
  if (!container) return;

  const openCount = lijstItems.filter((item) => !item.strikedthrough).length;
  const doneCount = lijstItems.length - openCount;

  container.innerHTML = `
    <div class="hero fin-hero">
      <div>
        <h2>Boodschappenlijst</h2>
        <p class="muted">${openCount} open · ${doneCount} afgevinkt · ${lijstItems.length} totaal</p>
      </div>
      <button type="button" class="btn btn-secondary btn-small" id="refresh-lijst">Vernieuwen</button>
    </div>

    <section class="card lijst-search-card">
      <label for="lijst-search-input">
        <span class="muted">Product zoeken</span>
        <input id="lijst-search-input" class="fin-select" type="search" placeholder="Bijv. melk, brood, kaas…" autocomplete="off" />
      </label>
      <div id="lijst-search-results" class="lijst-search-results muted">Typ minimaal 2 tekens om te zoeken.</div>
    </section>

    <section class="card lijst-items-card">
      <div class="section-header">
        <h3>Op je lijst</h3>
      </div>
      <ul id="lijst-items" class="lijst-items">
        ${
          lijstItems.length
            ? lijstItems.map(renderListItemRow).join("")
            : `<li class="muted" style="padding:1rem">Je lijst is leeg. Zoek een product of voeg iets toe via eerder gekocht.</li>`
        }
      </ul>
    </section>

    <section class="card lijst-prev-card">
      <div class="section-header">
        <h3>Eerder gekocht</h3>
        <span class="muted">Op basis van je bonnetjes</span>
      </div>
      <ul class="lijst-prev-list">
        ${
          previouslyBought.length
            ? previouslyBought.map(renderPreviouslyBoughtItem).join("")
            : `<li class="muted" style="padding:0.5rem 0">Nog geen producthistorie beschikbaar.</li>`
        }
      </ul>
    </section>
  `;

  container.querySelector("#refresh-lijst")?.addEventListener("click", () => loadLijst(true));
  container.querySelector("#lijst-search-input")?.addEventListener("input", onLijstSearchInput);
  bindLijstItemActions(container);
  bindLijstAddButtons(container);
  bindLijstGotoButtons(container);
  bindProductOpenButtons(container);
}

function bindLijstGotoButtons(root) {
  root.querySelectorAll("[data-goto]").forEach((button) => {
    button.addEventListener("click", () => setActivePage(button.dataset.goto));
  });
}

function bindLijstAddButtons(root) {
  root.querySelectorAll(".lijst-add-btn").forEach((button) => {
    button.addEventListener("click", () => addProductToLijst(button));
  });
}

function bindLijstItemActions(root) {
  root.querySelectorAll(".lijst-item").forEach((row) => {
    const listItemId = row.dataset.listItemId;
    const item =
      lijstItems.find((entry) => String(entry.listItemId ?? "") === listItemId) ||
      lijstItems[[...row.parentElement.children].indexOf(row)];
    if (!item) return;

    row.querySelector(".lijst-toggle")?.addEventListener("change", () => {
      patchLijstItem("toggle", item);
    });

    row.querySelector(".lijst-remove")?.addEventListener("click", () => {
      patchLijstItem("remove", item);
    });

    row.querySelectorAll(".lijst-qty-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const delta = Number(button.dataset.delta);
        patchLijstItem("quantity", item, item.quantity + delta);
      });
    });
  });
}

function onLijstSearchInput(event) {
  const query = event.target.value.trim();
  const host = document.querySelector("#lijst-search-results");
  if (!host) return;

  clearTimeout(lijstSearchTimer);

  if (query.length < 2) {
    host.innerHTML = `<p class="muted">Typ minimaal 2 tekens om te zoeken.</p>`;
    return;
  }

  host.innerHTML = `<div class="loading-box"><div class="spinner"></div></div>`;

  lijstSearchTimer = setTimeout(async () => {
    try {
      const data = await api(`/api/shopping-list/search?q=${encodeURIComponent(query)}`);
      const products = data.products || [];

      if (!products.length) {
        host.innerHTML = `<p class="muted">Geen producten gevonden voor “${escapeHtmlLijst(query)}”.</p>`;
        return;
      }

      host.innerHTML = `<ul class="lijst-search-list">${products.map(renderSearchResult).join("")}</ul>`;
      bindLijstAddButtons(host);
      bindProductOpenButtons(host);
    } catch (error) {
      host.innerHTML = `<p class="muted">Zoeken mislukt: ${escapeHtmlLijst(error.message)}</p>`;
    }
  }, 350);
}

async function addProductToLijst(button) {
  const productId = button.dataset.productId;
  const title = button.dataset.title || "Product";
  if (!productId || lijstBusy) return;

  lijstBusy = true;
  try {
    const data = await api("/api/shopping-list/add", {
      method: "POST",
      body: JSON.stringify({ productId: Number(productId), quantity: 1 }),
    });
    lijstItems = data.items || [];
    showLijstToast(`${title} toegevoegd`);
    renderLijstShell(window.__lijstPreviouslyBought || []);
  } catch (error) {
    showLijstToast(error.message);
  } finally {
    lijstBusy = false;
  }
}

async function patchLijstItem(action, item, quantity) {
  if (lijstBusy) return;

  lijstBusy = true;
  try {
    const data = await api("/api/shopping-list/items", {
      method: "PATCH",
      body: JSON.stringify({ action, item, quantity }),
    });
    lijstItems = data.items || [];
    renderLijstShell(window.__lijstPreviouslyBought || []);
  } catch (error) {
    showLijstToast(error.message);
  } finally {
    lijstBusy = false;
  }
}

async function loadLijst(force = false) {
  if (!authStatus?.loggedIn || authStatus?.isAnonymous) {
    renderLijstLoginPrompt();
    return;
  }

  if (lijstLoaded && !force) return;

  renderLijstLoading("Lijst en bonhistorie laden…");

  try {
    const [listData, prevData] = await Promise.all([
      api("/api/shopping-list"),
      api("/api/previously-bought?limit=20"),
    ]);

    lijstItems = listData.items || [];
    window.__lijstPreviouslyBought = prevData.products || [];
    lijstLoaded = true;
    renderLijstShell(window.__lijstPreviouslyBought);
  } catch (error) {
    document.querySelector("#lijst-content").innerHTML = `
      <div class="mijn-ah-error card">
        <strong>Lijst kon niet worden geladen</strong>
        <p class="muted">${escapeHtmlLijst(error.message)}</p>
        <button type="button" class="btn btn-secondary" id="retry-lijst">Opnieuw proberen</button>
      </div>
    `;
    document.querySelector("#retry-lijst")?.addEventListener("click", () => {
      lijstLoaded = false;
      loadLijst(true);
    });
  }
}

function initLijst() {
  loadLijst();
}

function resetLijstCache() {
  lijstLoaded = false;
  lijstItems = [];
  window.__lijstPreviouslyBought = [];
}
