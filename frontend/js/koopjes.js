const KOOPJES_STORAGE_KEY = "ah_koopjes_store";
const KOOPJES_PREFS_KEY = "ah_koopjes_prefs";

const KOOPJES_SORT_OPTIONS = [
  { value: "discount-desc", label: "Hoogste korting" },
  { value: "price-asc", label: "Laagste prijs" },
  { value: "price-desc", label: "Hoogste prijs" },
  { value: "name-asc", label: "Naam A–Z" },
  { value: "stock-desc", label: "Meeste voorraad" },
  { value: "expiry-asc", label: "Snelst verlopen" },
];

const KOOPJES_VIEW_OPTIONS = [
  { value: "category", label: "Per categorie" },
  { value: "flat", label: "Alle koopjes" },
];

let koopjesLoaded = false;
let koopjesStores = [];
let koopjesBargains = [];
let koopjesCategories = [];
let selectedKoopjesStoreId = null;
let koopjesPostalCode = "";
let koopjesBusy = false;
let koopjesSort = "discount-desc";
let koopjesViewMode = "category";
let koopjesSearchQuery = "";
let koopjesCategoryFilter = "";

function escapeHtmlKoopjes(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parsePriceKoopjes(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isNaN(number) ? null : number;
}

function formatMoneyKoopjes(value) {
  const number = parsePriceKoopjes(value);
  if (number === null) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(number);
}

function formatExpiryKoopjes(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getExpiryUrgencyKoopjes(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const hours = (date.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hours <= 0) return "expired";
  if (hours <= 24) return "today";
  if (hours <= 48) return "soon";
  return null;
}

function getSavingsKoopjes(item) {
  const was = parsePriceKoopjes(item.priceWas);
  const now = parsePriceKoopjes(item.priceNow);
  if (was === null || now === null || was <= now) return null;
  return was - now;
}

function loadKoopjesPrefs() {
  try {
    const raw = localStorage.getItem(KOOPJES_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveKoopjesPrefs() {
  localStorage.setItem(
    KOOPJES_PREFS_KEY,
    JSON.stringify({
      sort: koopjesSort,
      viewMode: koopjesViewMode,
    })
  );
}

function applyKoopjesPrefs() {
  const prefs = loadKoopjesPrefs();
  if (KOOPJES_SORT_OPTIONS.some((option) => option.value === prefs.sort)) {
    koopjesSort = prefs.sort;
  }
  if (KOOPJES_VIEW_OPTIONS.some((option) => option.value === prefs.viewMode)) {
    koopjesViewMode = prefs.viewMode;
  }
}

function showKoopjesToast(message) {
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

function loadSavedKoopjesStore() {
  try {
    const raw = localStorage.getItem(KOOPJES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveKoopjesStore(storeId, postalCode) {
  localStorage.setItem(
    KOOPJES_STORAGE_KEY,
    JSON.stringify({ storeId: String(storeId), postalCode })
  );
}

function sortBargains(items, sortKey) {
  const copy = [...items];
  const cmpTitle = (a, b) =>
    String(a.title || "").localeCompare(String(b.title || ""), "nl", {
      sensitivity: "base",
    });

  switch (sortKey) {
    case "price-asc":
      return copy.sort(
        (a, b) =>
          (parsePriceKoopjes(a.priceNow) ?? Infinity) -
            (parsePriceKoopjes(b.priceNow) ?? Infinity) || cmpTitle(a, b)
      );
    case "price-desc":
      return copy.sort(
        (a, b) =>
          (parsePriceKoopjes(b.priceNow) ?? -Infinity) -
            (parsePriceKoopjes(a.priceNow) ?? -Infinity) || cmpTitle(a, b)
      );
    case "name-asc":
      return copy.sort(cmpTitle);
    case "stock-desc":
      return copy.sort(
        (a, b) => (b.stock ?? -1) - (a.stock ?? -1) || cmpTitle(a, b)
      );
    case "expiry-asc":
      return copy.sort((a, b) => {
        const dateA = a.expirationDate
          ? new Date(a.expirationDate).getTime()
          : Infinity;
        const dateB = b.expirationDate
          ? new Date(b.expirationDate).getTime()
          : Infinity;
        return dateA - dateB || cmpTitle(a, b);
      });
    case "discount-desc":
    default:
      return copy.sort(
        (a, b) =>
          (b.markdownPercentage ?? 0) - (a.markdownPercentage ?? 0) ||
          cmpTitle(a, b)
      );
  }
}

function filterBargains(items, query, categoryFilter) {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (!needle) return true;
    const haystack = [item.title, item.brand, item.salesUnitSize, item.category]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

function getUniqueKoopjesCategories() {
  return [...new Set(koopjesBargains.map((item) => item.category || "Overig"))].sort(
    (a, b) => String(a).localeCompare(String(b), "nl")
  );
}

function getProcessedKoopjes() {
  const filtered = filterBargains(
    koopjesBargains,
    koopjesSearchQuery,
    koopjesCategoryFilter
  );
  const sorted = sortBargains(filtered, koopjesSort);

  if (koopjesViewMode === "flat") {
    return {
      categories: [],
      flatItems: sorted,
      filteredCount: filtered.length,
      totalCount: koopjesBargains.length,
    };
  }

  const byCategory = new Map();
  for (const item of sorted) {
    const category = item.category || "Overig";
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(item);
  }

  const categories = [...byCategory.entries()]
    .map(([name, items]) => ({
      name,
      count: items.length,
      items,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        String(a.name).localeCompare(String(b.name), "nl")
    );

  return {
    categories,
    flatItems: [],
    filteredCount: filtered.length,
    totalCount: koopjesBargains.length,
  };
}

function renderKoopjesLoading(message) {
  const container = document.querySelector("#koopjes-content");
  if (!container) return;
  container.innerHTML = `
    <div class="loading-box card" style="padding:2rem">
      <div class="spinner"></div>
      <strong>${escapeHtmlKoopjes(message)}</strong>
      <p class="muted">Laatste-kans producten zijn per winkel verschillend.</p>
    </div>
  `;
}

function renderKoopjesLoginPrompt() {
  const container = document.querySelector("#koopjes-content");
  if (!container) return;

  const isGuest = authStatus?.loggedIn && authStatus?.isAnonymous;
  container.innerHTML = `
    <div class="card" style="padding:2rem">
      <h3>${isGuest ? "Gastmodus actief" : "Nog niet ingelogd"}</h3>
      <p class="muted" style="margin:0.75rem 0 1rem">
        Log in om laatste-kans koopjes bij jouw AH-winkel te bekijken.
      </p>
      <button type="button" class="btn btn-primary" data-goto="login-page">Inloggen</button>
    </div>
  `;
  container.querySelector("[data-goto]")?.addEventListener("click", () => {
    setActivePage("login-page");
  });
}

function renderBargainCard(item) {
  const discount =
    item.markdownPercentage !== null && item.markdownPercentage !== undefined
      ? `-${Math.round(item.markdownPercentage)}%`
      : "Korting";
  const expiry = formatExpiryKoopjes(item.expirationDate);
  const urgency = getExpiryUrgencyKoopjes(item.expirationDate);
  const savings = getSavingsKoopjes(item);
  const stockLow =
    item.stock !== null && item.stock !== undefined && Number(item.stock) <= 3;
  const image = item.image
    ? `<img src="${escapeHtmlKoopjes(item.image)}" alt="${escapeHtmlKoopjes(item.title)}" class="koopjes-image" loading="lazy" />`
    : `<div class="koopjes-image placeholder" aria-hidden="true">%</div>`;

  const expiryClass =
    urgency === "today" || urgency === "expired"
      ? "koopjes-expiry koopjes-expiry-urgent"
      : urgency === "soon"
        ? "koopjes-expiry koopjes-expiry-soon"
        : "koopjes-expiry";

  const expiryLabel =
    urgency === "today"
      ? `Vandaag t/m ${escapeHtmlKoopjes(expiry)}`
      : urgency === "soon"
        ? `Bijna verlopen · t/m ${escapeHtmlKoopjes(expiry)}`
        : `Geldig t/m ${escapeHtmlKoopjes(expiry)}`;

  return `
    <article class="koopjes-card card">
      ${image}
      <div class="koopjes-card-body">
        <div class="koopjes-card-top">
          <span class="koopjes-discount">${escapeHtmlKoopjes(discount)}</span>
          ${
            item.stock !== null
              ? `<span class="koopjes-stock${stockLow ? " koopjes-stock-low" : ""}">nog ${escapeHtmlKoopjes(String(item.stock))}</span>`
              : ""
          }
        </div>
        <h3 class="koopjes-card-title">
          ${
            item.productId
              ? `<button type="button" class="koopjes-product-link product-open-btn" data-product-id="${escapeHtmlKoopjes(String(item.productId))}">${escapeHtmlKoopjes(item.title)}</button>`
              : escapeHtmlKoopjes(item.title)
          }
        </h3>
        ${
          item.brand || item.salesUnitSize
            ? `<p class="muted koopjes-meta">
                ${[item.brand, item.salesUnitSize].filter(Boolean).map(escapeHtmlKoopjes).join(" · ")}
              </p>`
            : ""
        }
        <div class="koopjes-prices">
          ${item.priceWas ? `<span class="koopjes-was">${formatMoneyKoopjes(item.priceWas)}</span>` : ""}
          <strong class="koopjes-now">${formatMoneyKoopjes(item.priceNow)}</strong>
          ${
            savings !== null
              ? `<span class="koopjes-save">bespaar ${formatMoneyKoopjes(savings)}</span>`
              : ""
          }
        </div>
        ${expiry ? `<p class="muted ${expiryClass}">${expiryLabel}</p>` : ""}
        ${
          item.productId
            ? `<button
                type="button"
                class="btn btn-secondary btn-small koopjes-add-btn"
                data-product-id="${escapeHtmlKoopjes(String(item.productId))}"
                data-title="${escapeHtmlKoopjes(item.title)}"
                ${koopjesBusy ? "disabled" : ""}
              >
                + Op lijst
              </button>`
            : ""
        }
      </div>
    </article>
  `;
}

function renderKoopjesEmptyFiltered() {
  return `
    <div class="card koopjes-empty">
      <strong>Geen koopjes gevonden</strong>
      <p class="muted">Pas je zoekterm of filters aan om meer resultaten te zien.</p>
      <button type="button" class="btn btn-secondary btn-small" id="koopjes-clear-filters">
        Filters wissen
      </button>
    </div>
  `;
}

function renderKoopjesCategories(categories, flatItems) {
  if (!categories.length && !flatItems.length) {
    if (koopjesBargains.length) return renderKoopjesEmptyFiltered();
    return `<div class="card koopjes-empty"><p class="muted">Geen laatste-kans koopjes gevonden voor deze winkel.</p></div>`;
  }

  if (flatItems.length) {
    return `
      <section class="koopjes-category">
        <div class="koopjes-grid">
          ${flatItems.map(renderBargainCard).join("")}
        </div>
      </section>
    `;
  }

  return categories
    .map(
      (category) => `
      <section class="koopjes-category">
        <div class="koopjes-category-header">
          <h3>${escapeHtmlKoopjes(category.name)}</h3>
          <span class="muted">${category.count} product${category.count === 1 ? "" : "en"}</span>
        </div>
        <div class="koopjes-grid">
          ${category.items.map(renderBargainCard).join("")}
        </div>
      </section>
    `
    )
    .join("");
}

function renderKoopjesCategoryChips() {
  const categories = getUniqueKoopjesCategories();
  if (!categories.length) return "";

  const chips = [
    `<button type="button" class="koopjes-chip${koopjesCategoryFilter === "" ? " active" : ""}" data-category="">Alles</button>`,
    ...categories.map(
      (name) => `
      <button
        type="button"
        class="koopjes-chip${koopjesCategoryFilter === name ? " active" : ""}"
        data-category="${escapeHtmlKoopjes(name)}"
      >
        ${escapeHtmlKoopjes(name)}
      </button>
    `
    ),
  ];

  return `<div class="koopjes-category-chips" role="tablist" aria-label="Categorieën">${chips.join("")}</div>`;
}

function renderKoopjesResultMeta(processed) {
  const { filteredCount, totalCount } = processed;
  const sortLabel =
    KOOPJES_SORT_OPTIONS.find((option) => option.value === koopjesSort)?.label ||
    "Sortering";

  if (!totalCount) return "";

  if (filteredCount === totalCount) {
    return `${filteredCount} koopjes · gesorteerd op ${sortLabel.toLowerCase()}`;
  }

  return `${filteredCount} van ${totalCount} koopjes · gesorteerd op ${sortLabel.toLowerCase()}`;
}

function renderKoopjesToolbar() {
  if (!koopjesBargains.length) return "";

  const categoryOptions = getUniqueKoopjesCategories()
    .map(
      (name) => `
      <option value="${escapeHtmlKoopjes(name)}" ${koopjesCategoryFilter === name ? "selected" : ""}>
        ${escapeHtmlKoopjes(name)}
      </option>
    `
    )
    .join("");

  const sortOptions = KOOPJES_SORT_OPTIONS.map(
    (option) => `
    <option value="${option.value}" ${koopjesSort === option.value ? "selected" : ""}>
      ${option.label}
    </option>
  `
  ).join("");

  const viewOptions = KOOPJES_VIEW_OPTIONS.map(
    (option) => `
    <option value="${option.value}" ${koopjesViewMode === option.value ? "selected" : ""}>
      ${option.label}
    </option>
  `
  ).join("");

  const processed = getProcessedKoopjes();

  return `
    <section class="card koopjes-toolbar" id="koopjes-toolbar">
      <label class="koopjes-search-wrap" for="koopjes-search">
        <span class="muted">Zoeken</span>
        <input
          id="koopjes-search"
          class="fin-select"
          type="search"
          placeholder="Naam, merk of categorie…"
          value="${escapeHtmlKoopjes(koopjesSearchQuery)}"
          autocomplete="off"
          enterkeyhint="search"
        />
      </label>

      ${renderKoopjesCategoryChips()}

      <div class="koopjes-toolbar-filters">
        <label for="koopjes-sort">
          <span class="muted">Sorteren</span>
          <select id="koopjes-sort" class="fin-select">${sortOptions}</select>
        </label>
        <label for="koopjes-view">
          <span class="muted">Weergave</span>
          <select id="koopjes-view" class="fin-select">${viewOptions}</select>
        </label>
        <label for="koopjes-category-filter" class="koopjes-category-select">
          <span class="muted">Categorie</span>
          <select id="koopjes-category-filter" class="fin-select">
            <option value="">Alle categorieën</option>
            ${categoryOptions}
          </select>
        </label>
      </div>

      <p class="koopjes-result-meta muted" id="koopjes-result-meta">
        ${escapeHtmlKoopjes(renderKoopjesResultMeta(processed))}
      </p>
    </section>
  `;
}

function renderKoopjesResultsHtml() {
  const processed = getProcessedKoopjes();
  return renderKoopjesCategories(processed.categories, processed.flatItems);
}

function updateKoopjesResults() {
  const results = document.querySelector("#koopjes-results");
  const meta = document.querySelector("#koopjes-result-meta");
  if (!results) return;

  const processed = getProcessedKoopjes();
  results.innerHTML = renderKoopjesResultsHtml();

  if (meta) {
    meta.textContent = renderKoopjesResultMeta(processed);
  }

  syncKoopjesCategoryChips();
  bindKoopjesAddButtons(results);
  bindKoopjesClearFilters(results);
  bindProductOpenButtons(results);
}

function syncKoopjesCategoryChips() {
  document.querySelectorAll(".koopjes-chip").forEach((chip) => {
    const category = chip.dataset.category || "";
    chip.classList.toggle("active", category === koopjesCategoryFilter);
  });

  const categorySelect = document.querySelector("#koopjes-category-filter");
  if (categorySelect) categorySelect.value = koopjesCategoryFilter;
}

function bindKoopjesAddButtons(root = document) {
  root.querySelectorAll(".koopjes-add-btn").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => addKoopjeToList(button));
  });
}

function bindKoopjesClearFilters(root = document) {
  root.querySelector("#koopjes-clear-filters")?.addEventListener("click", () => {
    koopjesSearchQuery = "";
    koopjesCategoryFilter = "";
    const search = document.querySelector("#koopjes-search");
    if (search) search.value = "";
    updateKoopjesResults();
  });
}

function bindKoopjesToolbarEvents(container) {
  const searchInput = container.querySelector("#koopjes-search");
  searchInput?.addEventListener("input", (event) => {
    koopjesSearchQuery = event.target.value;
    updateKoopjesResults();
  });

  container.querySelector("#koopjes-sort")?.addEventListener("change", (event) => {
    koopjesSort = event.target.value;
    saveKoopjesPrefs();
    updateKoopjesResults();
  });

  container.querySelector("#koopjes-view")?.addEventListener("change", (event) => {
    koopjesViewMode = event.target.value;
    saveKoopjesPrefs();
    updateKoopjesResults();
  });

  container.querySelector("#koopjes-category-filter")?.addEventListener("change", (event) => {
    koopjesCategoryFilter = event.target.value;
    syncKoopjesCategoryChips();
    updateKoopjesResults();
  });

  container.querySelectorAll(".koopjes-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      koopjesCategoryFilter = chip.dataset.category || "";
      syncKoopjesCategoryChips();
      updateKoopjesResults();
    });
  });
}

function getSelectedStoreLabel() {
  const store = koopjesStores.find(
    (entry) => String(entry.id) === String(selectedKoopjesStoreId)
  );
  return store?.name || null;
}

function renderKoopjesShell() {
  const container = document.querySelector("#koopjes-content");
  if (!container) return;

  const storeOptions = koopjesStores
    .map(
      (store) => `
      <option value="${escapeHtmlKoopjes(String(store.id))}" ${String(store.id) === String(selectedKoopjesStoreId) ? "selected" : ""}>
        ${escapeHtmlKoopjes(store.label)}
      </option>
    `
    )
    .join("");

  const storeLabel = getSelectedStoreLabel();
  const processed = getProcessedKoopjes();

  container.innerHTML = `
    <div class="hero fin-hero koopjes-hero">
      <div class="koopjes-hero-text">
        <h2>Laatste kans koopjes</h2>
        <p>Vandaag-af en bijna-verlopen producten bij jouw winkel. Per filiaal verschillend.</p>
        ${
          koopjesBargains.length
            ? `<p class="koopjes-hero-stats">${processed.filteredCount === processed.totalCount ? `${processed.totalCount} koopjes` : `${processed.filteredCount} van ${processed.totalCount} koopjes`}${storeLabel ? ` · ${escapeHtmlKoopjes(storeLabel)}` : ""}</p>`
            : storeLabel
              ? `<p class="koopjes-hero-stats">${escapeHtmlKoopjes(storeLabel)}</p>`
              : ""
        }
      </div>
      <button type="button" class="btn btn-secondary btn-small koopjes-refresh-btn" id="refresh-koopjes">Vernieuwen</button>
    </div>

    <section class="card koopjes-controls">
      <div class="koopjes-controls-grid">
        <label for="koopjes-postal">
          <span class="muted">Postcode</span>
          <input id="koopjes-postal" class="fin-select" type="text" inputmode="text" autocapitalize="characters" value="${escapeHtmlKoopjes(koopjesPostalCode)}" placeholder="3521GZ" maxlength="7" />
        </label>
        <label for="koopjes-store">
          <span class="muted">Winkel</span>
          <select id="koopjes-store" class="fin-select" ${koopjesStores.length ? "" : "disabled"}>
            ${storeOptions || '<option value="">Geen winkels gevonden</option>'}
          </select>
        </label>
        <div class="koopjes-controls-actions">
          <button type="button" class="btn btn-primary" id="koopjes-search-stores">Winkels zoeken</button>
        </div>
      </div>
    </section>

    ${renderKoopjesToolbar()}

    <div id="koopjes-results">
      ${renderKoopjesResultsHtml()}
    </div>
  `;

  container.querySelector("#refresh-koopjes")?.addEventListener("click", () => {
    if (selectedKoopjesStoreId) {
      loadKoopjesForStore(selectedKoopjesStoreId, true);
    } else {
      loadKoopjes(true);
    }
  });

  container.querySelector("#koopjes-search-stores")?.addEventListener("click", () => {
    const postal = container.querySelector("#koopjes-postal")?.value || "";
    searchKoopjesStores(postal);
  });

  container.querySelector("#koopjes-postal")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const postal = event.target.value || "";
      searchKoopjesStores(postal);
    }
  });

  container.querySelector("#koopjes-store")?.addEventListener("change", (event) => {
    selectedKoopjesStoreId = event.target.value;
    koopjesSearchQuery = "";
    koopjesCategoryFilter = "";
    saveKoopjesStore(selectedKoopjesStoreId, koopjesPostalCode);
    loadKoopjesForStore(selectedKoopjesStoreId, true);
  });

  bindKoopjesToolbarEvents(container);
  bindKoopjesAddButtons(container);
  bindKoopjesClearFilters(container);
  bindProductOpenButtons(container);
}

async function addKoopjeToList(button) {
  const productId = button.dataset.productId;
  const title = button.dataset.title || "Product";
  if (!productId || koopjesBusy) return;

  const originalText = button.textContent;
  koopjesBusy = true;
  button.disabled = true;

  try {
    await api("/api/shopping-list/add", {
      method: "POST",
      body: JSON.stringify({ productId: Number(productId), quantity: 1 }),
    });
    showKoopjesToast(`${title} op je lijst gezet`);
    button.textContent = "✓ Op lijst";
    resetLijstCache();
  } catch (error) {
    showKoopjesToast(error.message);
    button.disabled = false;
    button.textContent = originalText;
  } finally {
    koopjesBusy = false;
  }
}

async function searchKoopjesStores(postalCode) {
  renderKoopjesLoading("Winkels zoeken…");

  try {
    const data = await api(`/api/bargains/stores?postalCode=${encodeURIComponent(postalCode)}`);
    koopjesStores = data.stores || [];
    koopjesPostalCode = data.postalCode || postalCode;

    if (!koopjesStores.length) {
      document.querySelector("#koopjes-content").innerHTML = `
        <div class="mijn-ah-error card">
          <strong>Geen winkels gevonden</strong>
          <p class="muted">Probeer een andere postcode.</p>
          <button type="button" class="btn btn-secondary" id="retry-koopjes">Opnieuw</button>
        </div>
      `;
      document.querySelector("#retry-koopjes")?.addEventListener("click", () => loadKoopjes(true));
      return;
    }

    const saved = loadSavedKoopjesStore();
    selectedKoopjesStoreId =
      koopjesStores.find((store) => String(store.id) === String(saved?.storeId))?.id ||
      koopjesStores[0].id;

    saveKoopjesStore(selectedKoopjesStoreId, koopjesPostalCode);
    await loadKoopjesForStore(selectedKoopjesStoreId, true);
  } catch (error) {
    document.querySelector("#koopjes-content").innerHTML = `
      <div class="mijn-ah-error card">
        <strong>Winkels zoeken mislukt</strong>
        <p class="muted">${escapeHtmlKoopjes(error.message)}</p>
        <button type="button" class="btn btn-secondary" id="retry-koopjes">Opnieuw proberen</button>
      </div>
    `;
    document.querySelector("#retry-koopjes")?.addEventListener("click", () => loadKoopjes(true));
  }
}

async function loadKoopjesForStore(storeId, force = false) {
  if (!storeId) return;

  const existingShell = document.querySelector("#koopjes-results");
  if (existingShell) {
    existingShell.innerHTML = `
      <div class="loading-box card koopjes-loading-inline">
        <div class="spinner"></div>
        <strong>Koopjes ophalen…</strong>
      </div>
    `;
  } else {
    renderKoopjesLoading("Koopjes ophalen…");
  }

  try {
    const data = await api(`/api/bargains?storeId=${encodeURIComponent(storeId)}`);
    koopjesBargains = data.bargains || [];
    koopjesCategories = data.categories || [];
    if (force) koopjesLoaded = true;
    renderKoopjesShell();
  } catch (error) {
    const results = document.querySelector("#koopjes-results");
    const target = results || document.querySelector("#koopjes-content");
    if (target) {
      target.innerHTML = `
        <div class="mijn-ah-error card">
          <strong>Koopjes laden mislukt</strong>
          <p class="muted">${escapeHtmlKoopjes(error.message)}</p>
          <button type="button" class="btn btn-secondary" id="retry-koopjes-store">Opnieuw proberen</button>
        </div>
      `;
      target.querySelector("#retry-koopjes-store")?.addEventListener("click", () => {
        loadKoopjesForStore(storeId, true);
      });
    }
  }
}

async function loadKoopjes(force = false) {
  if (!authStatus?.loggedIn || authStatus?.isAnonymous) {
    renderKoopjesLoginPrompt();
    return;
  }

  if (koopjesLoaded && !force) return;

  applyKoopjesPrefs();
  renderKoopjesLoading("Profiel en winkels laden…");

  try {
    const context = await api("/api/bargains/context");
    const saved = loadSavedKoopjesStore();
    koopjesPostalCode = saved?.postalCode || context.defaultPostalCode || "";

    if (!koopjesPostalCode) {
      document.querySelector("#koopjes-content").innerHTML = `
        <div class="card koopjes-start-card">
          <h3>Postcode nodig</h3>
          <p class="muted">Koopjes zijn per winkel. Vul je postcode in om een AH bij jou in de buurt te kiezen.</p>
          <label class="koopjes-start-label" for="koopjes-postal-start">
            <span class="muted">Postcode</span>
            <input id="koopjes-postal-start" class="fin-select" type="text" inputmode="text" autocapitalize="characters" placeholder="3521GZ" maxlength="7" />
          </label>
          <button type="button" class="btn btn-primary" id="koopjes-start-search">Winkels zoeken</button>
        </div>
      `;
      const startSearch = () => {
        const postal = document.querySelector("#koopjes-postal-start")?.value || "";
        searchKoopjesStores(postal);
      };
      document.querySelector("#koopjes-start-search")?.addEventListener("click", startSearch);
      document.querySelector("#koopjes-postal-start")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          startSearch();
        }
      });
      return;
    }

    await searchKoopjesStores(koopjesPostalCode);
    koopjesLoaded = true;
  } catch (error) {
    document.querySelector("#koopjes-content").innerHTML = `
      <div class="mijn-ah-error card">
        <strong>Koopjes konden niet worden geladen</strong>
        <p class="muted">${escapeHtmlKoopjes(error.message)}</p>
        <button type="button" class="btn btn-secondary" id="retry-koopjes">Opnieuw proberen</button>
      </div>
    `;
    document.querySelector("#retry-koopjes")?.addEventListener("click", () => {
      koopjesLoaded = false;
      loadKoopjes(true);
    });
  }
}

function initKoopjes() {
  applyKoopjesPrefs();
  loadKoopjes();
}

function resetKoopjesCache() {
  koopjesLoaded = false;
  koopjesStores = [];
  koopjesBargains = [];
  koopjesCategories = [];
  selectedKoopjesStoreId = null;
  koopjesPostalCode = "";
  koopjesSearchQuery = "";
  koopjesCategoryFilter = "";
}
