let financieelLoaded = false;
let financieelMonths = [];
let selectedFinancieelMonth = null;
let financieelContext = { isPremium: false, stampPrice: 0.1 };

const DUTCH_MONTHS = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  const index = Number(month) - 1;
  if (!year || !DUTCH_MONTHS[index]) return monthKey;
  return `${DUTCH_MONTHS[index]} ${year}`;
}

function formatMoneyFin(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value));
}

function formatShortDateFin(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function escapeHtmlFin(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderFinancieelLoading(message) {
  const container = document.querySelector("#financieel-content");
  if (!container) return;
  container.innerHTML = `
    <div class="loading-box card" style="padding:2rem">
      <div class="spinner"></div>
      <strong>${escapeHtmlFin(message)}</strong>
      <p class="muted">Bonnetjes worden opgehaald en per maand gegroepeerd.</p>
    </div>
  `;
}

function renderFinancieelLoginPrompt() {
  const container = document.querySelector("#financieel-content");
  if (!container) return;

  const isGuest = authStatus?.loggedIn && authStatus?.isAnonymous;
  container.innerHTML = `
    <div class="card" style="padding:2rem">
      <h3>${isGuest ? "Gastmodus actief" : "Nog niet ingelogd"}</h3>
      <p class="muted" style="margin:0.75rem 0 1rem">
        ${
          isGuest
            ? "Log in met je echte AH-account om je uitgaven per maand te bekijken."
            : "Log in om je bonnetjes per maand te analyseren."
        }
      </p>
      <div class="actions">
        <button type="button" class="btn btn-primary" data-goto="login-page">Inloggen</button>
      </div>
    </div>
  `;
}

function formatBagLabel(count) {
  if (count === 1) return "1 tas";
  return `${count} tassen`;
}

function renderCarryBagsShame(carryBags) {
  const count = carryBags?.count ?? 0;
  if (!count) return "";

  const spent = carryBags.spent ?? 0;
  const receiptCount = carryBags.receiptCount ?? 0;
  const receiptNote =
    receiptCount === 1
      ? "op 1 bonnetje"
      : `verspreid over ${receiptCount} bonnetjes`;

  return `
    <section class="fin-bags-shame card">
      <div class="fin-bags-shame-icon" aria-hidden="true">🛍️</div>
      <div>
        <h3>Helaas, je hebt weer ${escapeHtmlFin(formatBagLabel(count))} gekocht.</h3>
        <p class="muted">
          ${formatMoneyFin(spent)} aan DRAAGTAS-regels ${escapeHtmlFin(receiptNote)}.
          Neem volgende keer je eigen tas mee.
        </p>
      </div>
    </section>
  `;
}

function renderKoopzegelsNote(koopzegels, stampPrice, isPremium) {
  const count = koopzegels?.count ?? 0;
  const spent = koopzegels?.spent ?? 0;
  const inferred = koopzegels?.inferredReceipts ?? 0;

  if (!count && !spent) {
    return `
      <div class="stat-card">
        <strong>0</strong>
        <span>Koopzegels</span>
        <p class="muted">Geen koopzegels gedetecteerd deze maand.</p>
      </div>
    `;
  }

  const inferredNote =
    inferred > 0
      ? `<p class="muted">${inferred} bon${inferred === 1 ? "" : "nen"} via bedragsverschil (niet expliciet op bon)</p>`
      : "";

  return `
    <div class="stat-card highlight">
      <strong>${escapeHtmlFin(String(count))}</strong>
      <span>Koopzegels · ${formatMoneyFin(spent)}</span>
      <p class="muted">à ${formatMoneyFin(stampPrice)} per zegel${isPremium ? " · Premium" : ""}</p>
      ${inferredNote}
    </div>
  `;
}

function renderTopProducts(title, products, mode) {
  if (!products.length) {
    return `<section class="fin-card card"><h3>${escapeHtmlFin(title)}</h3><p class="muted">Geen productdata voor deze maand.</p></section>`;
  }

  return `
    <section class="fin-card card">
      <h3>${escapeHtmlFin(title)}</h3>
      <ol class="fin-top-list">
        ${products
          .map((product, index) => {
            const meta =
              mode === "quantity"
                ? `${product.quantity}× gekocht · ${formatMoneyFin(product.spend)}`
                : `${formatMoneyFin(product.spend)} · ${product.quantity}×`;
            return `
              <li>
                <span class="fin-rank">${index + 1}</span>
                <div>
                  <strong>${escapeHtmlFin(product.name)}</strong>
                  <p class="muted">${escapeHtmlFin(meta)}</p>
                </div>
              </li>
            `;
          })
          .join("")}
      </ol>
    </section>
  `;
}

function renderMonthReceipts(receipts) {
  if (!receipts.length) {
    return `<section class="fin-card card"><h3>Bonnetjes deze maand</h3><p class="muted">Geen bonnetjes gevonden.</p></section>`;
  }

  return `
    <section class="fin-card card">
      <h3>Bonnetjes deze maand</h3>
      <ul class="simple-list">
        ${receipts
          .map(
            (receipt) => `
            <li>
              <button
                type="button"
                class="list-row receipt-row receipt-row-btn"
                data-receipt-id="${escapeHtmlFin(receipt.transactionId)}"
                data-receipt-date="${escapeHtmlFin(receipt.transactionMoment || "")}"
                data-receipt-total="${escapeHtmlFin(String(receipt.totalAmount ?? ""))}"
              >
                <div>
                  <strong>${formatShortDateFin(receipt.transactionMoment)}</strong>
                  <p class="muted">Winkelbon</p>
                </div>
                <div class="receipt-amounts">
                  <strong>${formatMoneyFin(receipt.totalAmount)}</strong>
                  <span class="receipt-open-label">Bekijken →</span>
                </div>
              </button>
            </li>
          `
          )
          .join("")}
      </ul>
    </section>
  `;
}

function bindReceiptButtons(root) {
  root.querySelectorAll(".receipt-row-btn").forEach((button) => {
    button.addEventListener("click", () => openReceiptDetail(button));
  });
}

function renderMonthChart(months) {
  if (!months?.length) return "";

  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const maxSpent = Math.max(...sorted.map((entry) => entry.totalSpent), 1);

  return `
    <section class="card fin-chart-card">
      <h3>Uitgaven per maand</h3>
      <div class="fin-chart">
        ${sorted
          .map((entry) => {
            const height = Math.max(8, Math.round((entry.totalSpent / maxSpent) * 100));
            const monthNumber = Number(entry.month.split("-")[1]) - 1;
            const shortLabel = DUTCH_MONTHS[monthNumber]?.slice(0, 3) || entry.month;
            return `
              <div class="fin-chart-col" title="${escapeHtmlFin(formatMonthLabel(entry.month))}: ${formatMoneyFin(entry.totalSpent)}">
                <div class="fin-chart-bar-wrap">
                  <div class="fin-chart-bar" style="height:${height}%"></div>
                </div>
                <span class="fin-chart-label">${escapeHtmlFin(shortLabel)}</span>
                <span class="fin-chart-value">${formatMoneyFin(entry.totalSpent)}</span>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderFinancieelDetail(data) {
  const host = document.querySelector("#fin-month-detail");
  if (!host) return;

  if (data.stampPrice) {
    window.__koopzegelsStampPrice = data.stampPrice;
    financieelContext.stampPrice = data.stampPrice;
  }
  if (typeof data.isPremium === "boolean") {
    financieelContext.isPremium = data.isPremium;
  }

  host.innerHTML = `
    <div class="fin-month-header">
      <p class="muted">
        ${data.receiptCount} bonnetje${data.receiptCount === 1 ? "" : "s"} · ${data.uniqueProducts} unieke producten
        ${data.isPremium ? ' · <span class="premium-badge">Premium</span>' : ""}
      </p>
      <button type="button" class="btn btn-secondary btn-small" id="refresh-fin-month">Vernieuwen</button>
    </div>

    ${renderCarryBagsShame(data.carryBags)}

    <div class="mijn-ah-stats fin-stats">
      <div class="stat-card highlight">
        <strong>${formatMoneyFin(data.totalSpent)}</strong>
        <span>Totaal uitgegeven</span>
      </div>
      <div class="stat-card highlight">
        <strong>${escapeHtmlFin(String(data.receiptCount))}</strong>
        <span>Winkelbezoeken</span>
      </div>
      <div class="stat-card highlight">
        <strong>${formatMoneyFin(data.averagePerTrip)}</strong>
        <span>Gemiddeld per bon</span>
      </div>
      <div class="stat-card highlight">
        <strong>${formatMoneyFin(data.discountTotal || 0)}</strong>
        <span>Korting (Uw voordeel)</span>
      </div>
      ${renderKoopzegelsNote(data.koopzegels, data.stampPrice, data.isPremium)}
    </div>

    <div class="fin-grid">
      ${renderTopProducts("Top 3 meest gekocht", data.topByQuantity || [], "quantity")}
      ${renderTopProducts("Top 3 hoogste uitgave", data.topBySpend || [], "spend")}
    </div>

    ${renderMonthReceipts(data.receipts || [])}
  `;

  host.querySelector("#refresh-fin-month")?.addEventListener("click", () => {
    loadFinancieelMonth(selectedFinancieelMonth, true);
  });

  bindReceiptButtons(host);
}

function renderFinancieelShell() {
  const container = document.querySelector("#financieel-content");
  if (!container) return;

  const options = financieelMonths
    .map(
      (entry) => `
      <option value="${escapeHtmlFin(entry.month)}" ${entry.month === selectedFinancieelMonth ? "selected" : ""}>
        ${escapeHtmlFin(formatMonthLabel(entry.month))} — ${formatMoneyFin(entry.totalSpent)} (${entry.receiptCount} bonnetjes)
      </option>
    `
    )
    .join("");

  container.innerHTML = `
    <div class="hero fin-hero">
      <div>
        <h2>Financieel overzicht ${financieelContext.isPremium ? '<span class="premium-badge">Premium</span>' : ""}</h2>
        <p class="muted">Uitgaven per maand op basis van je winkelbonnetjes.</p>
      </div>
    </div>

    <section class="card fin-controls">
      <label for="fin-month-select">
        <span class="muted">Kies een maand</span>
        <select id="fin-month-select" class="fin-select">
          ${options || '<option value="">Geen bonnetjes gevonden</option>'}
        </select>
      </label>
    </section>

    ${renderMonthChart(financieelMonths)}

    <div id="fin-month-detail">
      <div class="loading-box card" style="padding:2rem">
        <div class="spinner"></div>
        <strong>Maand analyseren…</strong>
      </div>
    </div>
  `;

  document.querySelector("#fin-month-select")?.addEventListener("change", (event) => {
    selectedFinancieelMonth = event.target.value;
    loadFinancieelMonth(selectedFinancieelMonth, true);
  });
}

async function loadFinancieelMonth(month, force = false) {
  if (!month) return;

  const host = document.querySelector("#fin-month-detail");
  if (host) {
    host.innerHTML = `
      <div class="loading-box card" style="padding:2rem">
        <div class="spinner"></div>
        <strong>${escapeHtmlFin(formatMonthLabel(month))} analyseren…</strong>
        <p class="muted">Bonnetjes en productregels worden opgehaald.</p>
      </div>
    `;
  }

  try {
    const data = await api(`/api/financial/month?month=${encodeURIComponent(month)}`);
    renderFinancieelDetail(data);
    if (!force) financieelLoaded = true;
  } catch (error) {
    if (host) {
      host.innerHTML = `
        <div class="mijn-ah-error card">
          <strong>Kon maand niet laden</strong>
          <p class="muted">${escapeHtmlFin(error.message)}</p>
        </div>
      `;
    }
  }
}

async function loadFinancieel(force = false) {
  if (!authStatus?.loggedIn || authStatus?.isAnonymous) {
    renderFinancieelLoginPrompt();
    return;
  }

  if (financieelLoaded && !force) return;

  renderFinancieelLoading("Financiële maanden ophalen…");

  try {
    const data = await api("/api/financial/months");
    financieelMonths = data.months || [];
    financieelContext = {
      isPremium: Boolean(data.isPremium),
      stampPrice: data.stampPrice ?? 0.1,
    };
    if (financieelContext.stampPrice) {
      window.__koopzegelsStampPrice = financieelContext.stampPrice;
    }
    selectedFinancieelMonth = financieelMonths[0]?.month || null;
    financieelLoaded = true;

    if (!financieelMonths.length) {
      document.querySelector("#financieel-content").innerHTML = `
        <div class="card" style="padding:2rem">
          <h3>Geen bonnetjes gevonden</h3>
          <p class="muted">Er zijn geen winkelbonnetjes beschikbaar om te analyseren.</p>
        </div>
      `;
      return;
    }

    renderFinancieelShell();
    await loadFinancieelMonth(selectedFinancieelMonth, true);
  } catch (error) {
    document.querySelector("#financieel-content").innerHTML = `
      <div class="mijn-ah-error card">
        <strong>Financieel overzicht kon niet worden geladen</strong>
        <p class="muted">${escapeHtmlFin(error.message)}</p>
        <button type="button" class="btn btn-secondary" id="retry-financieel">Opnieuw proberen</button>
      </div>
    `;
    document.querySelector("#retry-financieel")?.addEventListener("click", () => {
      financieelLoaded = false;
      loadFinancieel(true);
    });
  }
}

function initFinancieel() {
  loadFinancieel();
}

function resetFinancieelCache() {
  financieelLoaded = false;
  financieelMonths = [];
  selectedFinancieelMonth = null;
  financieelContext = { isPremium: false, stampPrice: 0.1 };
}
