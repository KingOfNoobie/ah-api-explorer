let mijnAhLoaded = false;

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value));
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderError(message) {
  return `<div class="mijn-ah-error">${escapeHtml(message)}</div>`;
}

let mijnAhActivating = false;

function showMijnAhToast(message) {
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

function renderOfferCard(offer, sectionKey) {
  const image = offer.image
    ? `<img src="${escapeHtml(offer.image)}" alt="" class="offer-image" loading="lazy" />`
    : `<div class="offer-image placeholder">%</div>`;

  const status = offer.status
    ? `<span class="offer-status ${offer.activated ? "active" : ""}">${escapeHtml(offer.activated ? "GEACTIVEERD" : offer.status)}</span>`
    : "";

  const activateButton = offer.activatable && (window.__mijnAhRemainingActivations ?? 1) > 0
    ? `<button type="button" class="btn btn-primary btn-small activate-offer-btn" data-section="${escapeHtml(sectionKey)}" data-offer-id="${escapeHtml(offer.offerId)}" data-segment-id="${escapeHtml(offer.segmentId)}" data-start-date="${escapeHtml(offer.startDate)}" data-title="${escapeHtml(offer.title)}" ${mijnAhActivating ? "disabled" : ""}>Activeren</button>`
    : offer.activated
      ? `<span class="muted offer-done">✓ Actief</span>`
      : "";

  return `
    <article class="offer-card ${offer.activated ? "offer-activated" : ""}">
      ${image}
      <div class="offer-body">
        <div class="offer-top">
          <strong>${escapeHtml(offer.title)}</strong>
          ${status}
        </div>
        ${offer.discount ? `<p class="offer-discount">${escapeHtml(offer.discount)}</p>` : ""}
        ${offer.subtitle ? `<p class="muted">${escapeHtml(offer.subtitle)}</p>` : ""}
        <p class="offer-meta muted">
          ${[offer.category, offer.period].filter(Boolean).map(escapeHtml).join(" · ")}
        </p>
        <div class="offer-actions">${activateButton}${
          offer.productId
            ? `<button type="button" class="btn btn-ghost btn-small product-open-btn" data-product-id="${escapeHtml(String(offer.productId))}">Product</button>`
            : ""
        }</div>
      </div>
    </article>
  `;
}

function renderOffersSection(title, section, errorKey, data, sectionKey) {
  if (sectionKey === "bonusbox") {
    window.__mijnAhRemainingActivations = section?.remainingActivations ?? null;
  }
  if (data?.errors?.[errorKey]) {
    return `
      <section class="mijn-ah-section card" data-section="${sectionKey}">
        <h3>${escapeHtml(title)}</h3>
        ${renderError(data.errors[errorKey])}
      </section>
    `;
  }

  const offers = section?.offers || [];
  const activatableCount = offers.filter((offer) => offer.activatable).length;

  if (!offers.length) {
    return `
      <section class="mijn-ah-section card" data-section="${sectionKey}">
        <h3>${escapeHtml(title)}</h3>
        <p class="muted">Geen aanbiedingen gevonden voor deze week.</p>
      </section>
    `;
  }

  const maxInfo = section.maxActivations
    ? `<span class="muted">${section.isPremium ? '<span class="premium-badge">Premium</span> · ' : ""}Max. ${section.maxActivations} activaties per week · ${section.activatedCount ?? 0}/${section.maxActivations} gebruikt</span>`
    : "";

  const activateAllButton =
    activatableCount > 0 && (section.remainingActivations ?? activatableCount) > 0
      ? `<button type="button" class="btn btn-secondary btn-small activate-all-btn" data-section="${sectionKey}" ${mijnAhActivating ? "disabled" : ""}>Activeer alle openstaande (${Math.min(activatableCount, section.remainingActivations ?? activatableCount)})</button>`
      : section.remainingActivations === 0 && activatableCount > 0
        ? `<span class="muted">Limiet bereikt voor deze week</span>`
        : "";

  return `
    <section class="mijn-ah-section card" data-section="${sectionKey}">
      <div class="section-header">
        <div>
          <h3>${escapeHtml(section.title || title)}</h3>
          ${maxInfo}
        </div>
        <div class="section-header-actions">
          ${activateAllButton}
          <span class="muted">${offers.length} aanbieding${offers.length === 1 ? "" : "en"}</span>
        </div>
      </div>
      <div class="offer-grid">${offers.map((offer) => renderOfferCard(offer, sectionKey)).join("")}</div>
    </section>
  `;
}

function renderStampPrograms(programs, error) {
  if (error) return "";

  const active = programs.filter((p) => p.status !== "FINISHED");
  const list = active.length ? active : programs;

  if (!list.length) {
    return `<section class="mijn-ah-section card"><h3>Spaaracties</h3><p class="muted">Geen actieve spaaracties.</p></section>`;
  }

  return `
    <section class="mijn-ah-section card">
      <h3>Spaaracties</h3>
      <div class="stamp-grid">
        ${list
          .map((program) => {
            const info = program.stampInfo || {};
            const balance = program.userStampInfo?.balance ?? 0;
            const perCard = info.stampsPerCard || "?";
            const onCard = perCard === "?" ? "?" : balance % perCard;
            const image = info.stampImages?.[0]?.url || program.overviewImages?.[0]?.url;
            return `
              <article class="stamp-card">
                ${image ? `<img src="${escapeHtml(image)}" alt="" class="stamp-image" loading="lazy" />` : ""}
                <div>
                  <strong>${escapeHtml(program.overviewTitle || program.name || `Actie ${program.id || ""}`)}</strong>
                  <p class="muted">${escapeHtml(program.status || "ACTIEF")}</p>
                  <p>${escapeHtml(String(onCard))} / ${escapeHtml(String(perCard))} zegels op kaart</p>
                  <p class="muted">Totaal gespaard: ${escapeHtml(String(balance))}</p>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderShoppingList(items, error) {
  if (error) {
    return `<section class="mijn-ah-section card"><h3>Boodschappenlijst</h3>${renderError(error)}</section>`;
  }

  if (!items.length) {
    return `<section class="mijn-ah-section card"><h3>Boodschappenlijst</h3><p class="muted">Je lijst is leeg.</p></section>`;
  }

  return `
    <section class="mijn-ah-section card">
      <div class="section-header">
        <h3>Boodschappenlijst</h3>
        <span class="muted">${items.length} item${items.length === 1 ? "" : "s"}</span>
      </div>
      <ul class="simple-list">
        ${items
          .slice(0, 12)
          .map((item) => {
            const product = item.productDetails?.product || item.product || {};
            const title = product.title || item.description || "Product";
            const qty = item.quantity ?? 1;
            const image = product.images?.find((img) => img.width >= 80)?.url;
            return `
              <li class="list-row">
                ${image ? `<img src="${escapeHtml(image)}" alt="" class="list-thumb" loading="lazy" />` : ""}
                <div>
                  <strong>${escapeHtml(title)}</strong>
                  <p class="muted">${qty}x${product.salesUnitSize ? ` · ${escapeHtml(product.salesUnitSize)}` : ""}</p>
                </div>
              </li>
            `;
          })
          .join("")}
      </ul>
    </section>
  `;
}

function renderReceipts(receipts, error) {
  if (error) {
    return `<section class="mijn-ah-section card"><h3>Recente bonnetjes</h3>${renderError(error)}</section>`;
  }

  if (!receipts.length) {
    return `<section class="mijn-ah-section card"><h3>Recente bonnetjes</h3><p class="muted">Geen bonnetjes gevonden.</p></section>`;
  }

  return `
    <section class="mijn-ah-section card">
      <h3>Recente bonnetjes</h3>
      <p class="muted receipt-hint">Klik op een bon om de regels te bekijken.</p>
      <ul class="simple-list">
        ${receipts
          .map((receipt) => {
            const amount = receipt.total?.amount?.amount ?? receipt.totalAmount;
            const discount = receipt.totalDiscount?.amount;
            const id = receipt.transactionId;
            return `
              <li>
                <button
                  type="button"
                  class="list-row receipt-row receipt-row-btn"
                  data-receipt-id="${escapeHtml(id)}"
                  data-receipt-date="${escapeHtml(receipt.transactionMoment || "")}"
                  data-receipt-total="${escapeHtml(String(amount ?? ""))}"
                >
                  <div>
                    <strong>${formatShortDate(receipt.transactionMoment)}</strong>
                    <p class="muted">${escapeHtml(receipt.storeName || "Winkelbon")}</p>
                  </div>
                  <div class="receipt-amounts">
                    <strong>${formatMoney(amount)}</strong>
                    ${discount ? `<span class="muted">-${formatMoney(discount)} korting</span>` : ""}
                    <span class="receipt-open-label">Bekijken →</span>
                  </div>
                </button>
              </li>
            `;
          })
          .join("")}
      </ul>
    </section>
  `;
}

function ensureReceiptModal() {
  let modal = document.querySelector("#receipt-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "receipt-modal";
  modal.className = "receipt-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="receipt-modal-backdrop" data-close-receipt></div>
    <div class="receipt-modal-panel card" role="dialog" aria-modal="true" aria-labelledby="receipt-modal-title">
      <div class="receipt-modal-header">
        <div>
          <h3 id="receipt-modal-title">Bonnetje</h3>
          <p class="muted" id="receipt-modal-subtitle"></p>
        </div>
        <button type="button" class="btn btn-secondary btn-small" data-close-receipt>Sluiten</button>
      </div>
      <div id="receipt-modal-body"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll("[data-close-receipt]").forEach((element) => {
    element.addEventListener("click", closeReceiptModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      closeReceiptModal();
    }
  });

  return modal;
}

function closeReceiptModal() {
  const modal = document.querySelector("#receipt-modal");
  if (modal) modal.hidden = true;
}

function renderReceiptDetailContent(receipt) {
  const products = receipt.products || [];
  const discounts = receipt.discounts || [];
  const payments = receipt.payments || [];

  const productsHtml = products.length
    ? `
      <table class="receipt-table">
        <thead>
          <tr>
            <th>Aantal</th>
            <th>Product</th>
            <th class="num">Prijs</th>
            <th class="num">Bedrag</th>
          </tr>
        </thead>
        <tbody>
          ${products
            .map(
              (product) => `
              <tr>
                <td>${escapeHtml(String(product.quantity ?? 1))}</td>
                <td>${escapeHtml(product.name || "Product")}</td>
                <td class="num">${product.unitPrice != null ? formatMoney(product.unitPrice) : "—"}</td>
                <td class="num">${product.amount ? formatMoney(product.amount) : "—"}</td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    `
    : `<p class="muted">Geen productregels gevonden op dit bonnetje.</p>`;

  const discountsHtml = discounts.length
    ? `
      <div class="receipt-detail-block">
        <h4>Korting</h4>
        <ul class="receipt-meta-list">
          ${discounts
            .map(
              (discount) => `
              <li>
                <span>${escapeHtml(discount.name || "Korting")}</span>
                <strong class="discount-amount">-${formatMoney(Math.abs(discount.amount))}</strong>
              </li>
            `
            )
            .join("")}
        </ul>
      </div>
    `
    : "";

  const paymentsHtml = payments.length
    ? `
      <div class="receipt-detail-block">
        <h4>Betaling</h4>
        <ul class="receipt-meta-list">
          ${payments
            .map(
              (payment) => `
              <li>
                <span>${escapeHtml(payment.method || "Betaald")}</span>
                <strong>${formatMoney(payment.amount)}</strong>
              </li>
            `
            )
            .join("")}
        </ul>
      </div>
    `
    : "";

  const summaryHtml =
    receipt.subtotalProducts != null
      ? `
      <div class="receipt-detail-block receipt-summary-block">
        <h4>Samenvatting</h4>
        <div class="receipt-meta-list">
          <div class="receipt-subtotal-row">
            <span>Producten</span>
            <strong>${formatMoney(receipt.grossProducts ?? receipt.subtotalProducts)}</strong>
          </div>
          ${
            receipt.discountTotal > 0
              ? `<div class="receipt-subtotal-row discount-line">
                  <span>Korting</span>
                  <strong class="discount-amount">-${formatMoney(receipt.discountTotal)}</strong>
                </div>`
              : ""
          }
          <div class="receipt-subtotal-row">
            <span>Na korting</span>
            <strong>${formatMoney(receipt.subtotalProducts)}</strong>
          </div>
          ${
            receipt.koopzegels?.length
              ? receipt.koopzegels
                  .map(
                    (line) => `
                <div class="receipt-subtotal-row koopzegel-line">
                  <span>${escapeHtml(line.label)}</span>
                  <strong>${formatMoney(line.amount)}</strong>
                </div>
              `
                  )
                  .join("")
              : receipt.unaccountedAmount > 0
                ? `
                <div class="receipt-subtotal-row">
                  <span>Overig (niet gespecificeerd)</span>
                  <strong>${formatMoney(receipt.unaccountedAmount)}</strong>
                </div>
              `
                : ""
          }
        </div>
        ${
          receipt.inferredKoopzegels
            ? `<p class="muted receipt-inferred-note">Het verschil tussen producten en totaal komt overeen met <strong>${receipt.inferredKoopzegels.quantity} koopzegels</strong> à ${formatMoney(receipt.inferredKoopzegels.stampPrice)}. De AH API toont koopzegels niet als aparte regel op het bonnetje.</p>`
            : receipt.unaccountedAmount > 0
              ? `<p class="muted receipt-inferred-note">Dit verschil kan koopzegels, statiegeld of een andere kassaregel zijn die niet in de API staat.</p>`
              : ""
        }
      </div>
    `
      : "";

  return `
    ${productsHtml}
    ${discountsHtml}
    ${summaryHtml}
    ${paymentsHtml}
    <div class="receipt-total-row">
      <span>Totaal betaald</span>
      <strong>${formatMoney(receipt.total)}</strong>
    </div>
  `;
}

async function openReceiptDetail(button) {
  const transactionId = button.dataset.receiptId;
  if (!transactionId) return;

  const modal = ensureReceiptModal();
  const title = modal.querySelector("#receipt-modal-title");
  const subtitle = modal.querySelector("#receipt-modal-subtitle");
  const body = modal.querySelector("#receipt-modal-body");

  title.textContent = "Bonnetje laden…";
  subtitle.textContent = "";
  body.innerHTML = `<div class="loading-box"><div class="spinner"></div></div>`;
  modal.hidden = false;

  const params = new URLSearchParams();
  if (button.dataset.receiptDate) params.set("date", button.dataset.receiptDate);
  if (button.dataset.receiptTotal) params.set("total", button.dataset.receiptTotal);
  if (window.__koopzegelsStampPrice) {
    params.set("stampPrice", String(window.__koopzegelsStampPrice));
  }

  try {
    const receipt = await api(
      `/api/receipts/${encodeURIComponent(transactionId)}?${params.toString()}`
    );
    title.textContent = `Bonnetje ${formatShortDate(receipt.transactionMoment || button.dataset.receiptDate)}`;
    subtitle.textContent = receipt.transactionId || transactionId;
    body.innerHTML = renderReceiptDetailContent(receipt);
  } catch (error) {
    title.textContent = "Bonnetje kon niet worden geladen";
    subtitle.textContent = "";
    body.innerHTML = renderError(error.message);
  }
}

function renderKoopzegelsSection(koopzegels, transactions, error) {
  if (error || !koopzegels) {
    return `<section class="mijn-ah-section card"><h3>Koopzegels</h3>${renderError(error || "Koopzegels niet beschikbaar")}</section>`;
  }

  const koop = koopzegels.points || {};
  const koopMoney = koopzegels.money || {};
  const fullTarget = koop.bookletTargets?.fullBooklet || 490;
  const current = koop.current ?? 0;
  const progress = fullTarget ? Math.min(100, Math.round((current / fullTarget) * 100)) : 0;
  const goalAmount = koopzegels.savingGoal?.target?.amount;
  const goalName = koopzegels.savingGoal?.name?.trim();
  const goalProgress =
    goalAmount && koopMoney.total
      ? Math.min(100, Math.round((koopMoney.total / goalAmount) * 100))
      : null;

  const transactionsHtml = transactions.length
    ? `<ul class="simple-list koopzegel-tx-list">
        ${transactions
          .slice(0, 8)
          .map(
            (tx) => `
            <li class="list-row receipt-row">
              <div>
                <strong>+${escapeHtml(String(tx.amount))} zegels</strong>
                <p class="muted">${escapeHtml(tx.reason || tx.type || "Transactie")}</p>
              </div>
              <span class="muted">${formatDate(tx.date)}</span>
            </li>
          `
          )
          .join("")}
      </ul>`
    : `<p class="muted">Transactiegeschiedenis is via de AH API niet meer beschikbaar. Je saldo hierboven is wel actueel.</p>`;

  return `
    <section class="mijn-ah-section card koopzegels-section">
      <div class="section-header">
        <div>
          <h3>Koopzegels</h3>
          <p class="muted">Je digitale spaarboekje bij Albert Heijn</p>
        </div>
        <div class="koopzegels-summary-pill">
          <strong>${escapeHtml(String(current))}</strong>
          <span>in dit boekje</span>
        </div>
      </div>

      <div class="koopzegels-progress-block">
        <div class="koopzegels-progress-labels">
          <span>Voortgang boekje</span>
          <span class="muted">${escapeHtml(String(current))} / ${escapeHtml(String(fullTarget))} zegels</span>
        </div>
        <div class="progress-bar" aria-hidden="true">
          <div class="progress-bar-fill" style="width:${progress}%"></div>
        </div>
      </div>

      <div class="koopzegels-grid">
        <div>
          <span class="muted">Volle boekjes</span>
          <strong>${escapeHtml(String(koop.fullBooklets ?? 0))}</strong>
        </div>
        <div>
          <span class="muted">Totaal gespaard</span>
          <strong>${escapeHtml(String(koop.total ?? 0))} zegels</strong>
        </div>
        <div>
          <span class="muted">Totale waarde</span>
          <strong>${formatMoney(koopMoney.total)}</strong>
        </div>
        <div>
          <span class="muted">Ingelegd / opbrengst</span>
          <strong>${formatMoney(koopMoney.investment)} · ${formatMoney(koopMoney.earnings)}</strong>
        </div>
      </div>

      ${
        goalName
          ? `<div class="koopzegels-goal">
              <div class="koopzegels-progress-labels">
                <span>Spaardoel: ${escapeHtml(goalName)}</span>
                <span class="muted">${formatMoney(koopMoney.total)} / ${formatMoney(goalAmount)}</span>
              </div>
              ${
                goalProgress !== null
                  ? `<div class="progress-bar" aria-hidden="true"><div class="progress-bar-fill goal" style="width:${goalProgress}%"></div></div>`
                  : ""
              }
            </div>`
          : ""
      }

      <div class="koopzegels-transactions">
        <h4>Recente mutaties</h4>
        ${transactionsHtml}
      </div>
    </section>
  `;
}

function renderKoopzegelTransactions(transactions, error) {
  return "";
}

function renderMijnAh(data) {
  const member = data.member;
  const name = member?.name
    ? [member.name.firstName, member.name.surname].filter(Boolean).join(" ")
    : "AH gebruiker";

  const airmilesBalance = data.airmiles?.balance;
  const airmilesCard = member?.loyaltyCards?.find((card) => card.type === "AM");
  const airmilesHint = data.errors.airmiles
    ? airmilesCard
      ? `<p class="muted">Kaart ${escapeHtml(airmilesCard.id)} gekoppeld</p>
         <a class="mini-link" href="https://mijnahmiles.ah.nl" target="_blank" rel="noopener">Saldo op mijnahmiles.ah.nl</a>`
      : ""
    : data.airmiles?.url
      ? `<a class="mini-link" href="${escapeHtml(data.airmiles.url)}" target="_blank" rel="noopener">Bekijk op airmiles.nl</a>`
      : "";
  const koop = data.koopzegels?.points || {};
  const koopMoney = data.koopzegels?.money || {};

  const container = document.querySelector("#mijn-ah-content");
  if (!container) return;

  window.__mijnAhRemainingActivations = data.bonusbox?.remainingActivations ?? null;
  window.__koopzegelsStampPrice = data.koopzegels?.constants?.stampPrice ?? 0.1;

  container.innerHTML = `
    <div class="hero mijn-ah-hero">
      <div>
        <h2>Mijn AH ${data.isPremium ? '<span class="premium-badge">Premium</span>' : ""}</h2>
        <p>Welkom ${escapeHtml(name)} — hier zie je je saldo's, bonus en lijstjes op één plek.</p>
        <p class="muted">Laatst ververst: ${formatDate(data.fetchedAt)} · Bonusweek vanaf ${formatShortDate(data.bonusWeek)}</p>
      </div>
      <button type="button" class="btn btn-secondary" id="refresh-mijn-ah">Vernieuwen</button>
    </div>

    <div class="mijn-ah-stats">
      <div class="stat-card highlight">
        <strong>${data.errors.airmiles ? "—" : escapeHtml(String(airmilesBalance ?? 0))}</strong>
        <span>Air Miles</span>
        ${airmilesHint}
        ${data.errors.airmiles ? `<p class="stat-error">${escapeHtml(data.errors.airmiles)}</p>` : ""}
      </div>
      <div class="stat-card highlight">
        <strong>${data.errors.koopzegels ? "—" : escapeHtml(String(koop.current ?? 0))}</strong>
        <span>Koopzegels dit boekje</span>
        <p class="muted">${data.errors.koopzegels ? "" : `${koop.fullBooklets ?? 0} volle boekjes · ${koop.total ?? 0} totaal`}</p>
        ${data.koopzegels?.savingGoal?.name ? `<p class="muted">Spaardoel: ${escapeHtml(data.koopzegels.savingGoal.name)}</p>` : ""}
        ${data.errors.koopzegels ? `<p class="stat-error">${escapeHtml(data.errors.koopzegels)}</p>` : ""}
      </div>
      <div class="stat-card highlight">
        <strong>${data.errors.koopzegels ? "—" : formatMoney(koopMoney.total)}</strong>
        <span>Waarde koopzegels</span>
        <p class="muted">${data.errors.koopzegels ? "" : `Ingelegd ${formatMoney(koopMoney.investment)} · Opbrengst ${formatMoney(koopMoney.earnings)}`}</p>
      </div>
      <div class="stat-card highlight">
        <strong>${data.errors.shoppingList ? "—" : escapeHtml(String(data.shoppingList.length))}</strong>
        <span>Items op lijst</span>
      </div>
    </div>

    ${renderOffersSection("Bonus spotlight", data.spotlight, "spotlight", data, "spotlight")}
    ${renderOffersSection("Bonusbox", data.bonusbox, "bonusbox", data, "bonusbox")}
    ${renderOffersSection("Persoonlijke Bonus", data.personalBonus, "personalBonus", data, "personalBonus")}
    ${renderKoopzegelsSection(data.koopzegels, data.koopzegelTransactions, data.errors.koopzegels)}
    ${renderStampPrograms(data.stampPrograms, data.errors.stampPrograms)}
    ${renderShoppingList(data.shoppingList, data.errors.shoppingList)}
    ${renderReceipts(data.receipts, data.errors.receipts)}

    <section class="mijn-ah-section card">
      <h3>Profiel</h3>
      ${
        member
          ? `<div class="profile-grid">
              <div><span class="muted">E-mail</span><strong>${escapeHtml(member.email || "—")}</strong></div>
              <div><span class="muted">Bonuskaart</span><strong>${escapeHtml(member.loyaltyCards?.find((c) => c.type === "BO")?.id || "—")}</strong></div>
              <div><span class="muted">Air Miles kaart</span><strong>${escapeHtml(member.loyaltyCards?.find((c) => c.type === "AM")?.id || "—")}</strong></div>
              <div><span class="muted">Woonplaats</span><strong>${escapeHtml(member.address?.city || "—")}</strong></div>
            </div>`
          : renderError(data.errors.member || "Profiel niet beschikbaar")
      }
    </section>
  `;

  document.querySelector("#refresh-mijn-ah")?.addEventListener("click", () => {
    loadMijnAh(true);
  });

  bindMijnAhActions();
}

async function activateSingleOffer(button) {
  if (mijnAhActivating) return;

  const payload = {
    offerId: button.dataset.offerId,
    segmentId: button.dataset.segmentId,
    startDate: button.dataset.startDate,
  };

  mijnAhActivating = true;
  button.disabled = true;
  button.textContent = "Bezig…";

  try {
    await api("/api/actions/bonus/activate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showMijnAhToast(`${button.dataset.title || "Aanbieding"} geactiveerd`);
    mijnAhLoaded = false;
    await loadMijnAh(true);
  } catch (error) {
    showMijnAhToast(error.message);
    button.disabled = false;
    button.textContent = "Activeren";
    mijnAhActivating = false;
  }
}

async function activateAllOffers(button) {
  if (mijnAhActivating) return;

  const source = button.dataset.section || "bonusbox";
  mijnAhActivating = true;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Bezig met activeren…";

  try {
    const result = await api("/api/actions/bonus/activate-all", {
      method: "POST",
      body: JSON.stringify({ source }),
    });
    showMijnAhToast(
      `${result.activated} geactiveerd${result.failed ? `, ${result.failed} mislukt` : ""}`
    );
    mijnAhLoaded = false;
    await loadMijnAh(true);
  } catch (error) {
    showMijnAhToast(error.message);
    button.disabled = false;
    button.textContent = originalText;
    mijnAhActivating = false;
  }
}

function bindMijnAhActions() {
  document.querySelectorAll(".activate-offer-btn").forEach((button) => {
    button.addEventListener("click", () => activateSingleOffer(button));
  });

  document.querySelectorAll(".activate-all-btn").forEach((button) => {
    button.addEventListener("click", () => activateAllOffers(button));
  });

  document.querySelectorAll(".receipt-row-btn").forEach((button) => {
    button.addEventListener("click", () => openReceiptDetail(button));
  });

  bindProductOpenButtons();
}

function renderMijnAhLoading() {
  const container = document.querySelector("#mijn-ah-content");
  if (!container) return;
  container.innerHTML = `
    <div class="loading-box card" style="padding:2rem">
      <div class="spinner"></div>
      <strong>Je AH-gegevens ophalen…</strong>
      <p class="muted">Air Miles, koopzegels, bonusbox, lijst en bonnetjes worden geladen.</p>
    </div>
  `;
}

function renderMijnAhLoginPrompt() {
  const container = document.querySelector("#mijn-ah-content");
  if (!container) return;

  const isGuest = authStatus?.loggedIn && authStatus?.isAnonymous;
  container.innerHTML = `
    <div class="card" style="padding:2rem">
      <h3>${isGuest ? "Gastmodus actief" : "Nog niet ingelogd"}</h3>
      <p class="muted" style="margin:0.75rem 0 1rem">
        ${
          isGuest
            ? "Log in met je echte AH-account om je persoonlijke gegevens te zien."
            : "Log in om je Air Miles, koopzegels, bonusbox en boodschappenlijst te bekijken."
        }
      </p>
      <div class="actions">
        <button type="button" class="btn btn-primary" data-goto="login-page">Inloggen</button>
        <button type="button" class="btn btn-secondary" data-goto="token-wizard-page">Token stappenplan</button>
      </div>
    </div>
  `;

  container.querySelectorAll("[data-goto]").forEach((button) => {
    button.addEventListener("click", () => setActivePage(button.dataset.goto));
  });
}

async function loadMijnAh(force = false) {
  if (!authStatus?.loggedIn || authStatus?.isAnonymous) {
    renderMijnAhLoginPrompt();
    return;
  }

  if (mijnAhLoaded && !force) return;

  renderMijnAhLoading();
  try {
    const data = await api("/api/dashboard");
    mijnAhActivating = false;
    renderMijnAh(data);
    mijnAhLoaded = true;
  } catch (error) {
    mijnAhActivating = false;
    const container = document.querySelector("#mijn-ah-content");
    if (container) {
      container.innerHTML = `
        <div class="mijn-ah-error card">
          <strong>Kon dashboard niet laden</strong>
          <p class="muted">${escapeHtml(error.message)}</p>
          <button type="button" class="btn btn-secondary" id="retry-mijn-ah">Opnieuw proberen</button>
        </div>
      `;
      document.querySelector("#retry-mijn-ah")?.addEventListener("click", () => {
        loadMijnAh(true);
      });
    }
  }
}

function initMijnAh() {
  loadMijnAh();
}

function resetMijnAhCache() {
  mijnAhLoaded = false;
}
