const WIZARD_STORAGE_KEY = "ah_token_wizard_progress";

const WIZARD_METHODS = {
  browser: {
    id: "browser",
    title: "Via browser (OAuth-code)",
    subtitle: "Geen extra software nodig",
    steps: [
      {
        title: "Kies je methode",
        type: "method",
      },
      {
        title: "Open het AH-inlogscherm",
        body: `
          <p>Open het officiële inlogscherm van Albert Heijn in een nieuw tabblad. Gebruik bij voorkeur een normaal browservenster (geen incognito), zodat je eventueel al ingelogd bent.</p>
          <div class="wizard-tip">Tip: laat dit stappenplan open in een ander tabblad.</div>
        `,
        actions: ["open-login", "copy-login-url"],
      },
      {
        title: "Log in met je AH-account",
        body: `
          <p>Log in met je e-mailadres en wachtwoord. Los eventueel de hCaptcha op als die verschijnt.</p>
          <p class="muted">Na succesvol inloggen probeert de browser door te sturen naar een URL die begint met <code>appie://login-exit</code>.</p>
        `,
        checklist: [
          "Ik heb mijn e-mail en wachtwoord ingevuld",
          "Ik heb de captcha opgelost (indien getoond)",
          "Ik zie een redirect of foutmelding over appie://",
        ],
      },
      {
        title: "Kopieer de redirect-URL of code",
        body: `
          <p>Na het inloggen verschijnt vaak een lege pagina of foutmelding — dat is normaal. De URL in de adresbalk bevat je code.</p>
          <div class="wizard-example">
            <strong>Voorbeeld URL:</strong>
            <code>appie://login-exit?code=abc123-def456-...</code>
          </div>
          <p class="muted">Kopieer de <strong>hele URL</strong> of alleen het stuk na <code>code=</code>.</p>
        `,
        checklist: [
          "Ik heb de URL of code gekopieerd",
        ],
      },
      {
        title: "Plak en activeer",
        type: "input-code",
      },
    ],
  },
  mitmproxy: {
    id: "mitmproxy",
    title: "Via AH-app + mitmproxy",
    subtitle: "Refresh token uit app-verkeer",
    steps: [
      {
        title: "Kies je methode",
        type: "method",
      },
      {
        title: "Installeer mitmproxy",
        body: `
          <p>Installeer <strong>mitmproxy</strong> op je computer om HTTPS-verkeer van je telefoon te bekijken.</p>
          <pre class="code-block">pip install mitmproxy
mitmweb</pre>
          <p class="muted">mitmweb opent een interface op <code>http://127.0.0.1:8081</code>.</p>
        `,
        actions: ["copy-mitm-command"],
        checklist: [
          "mitmproxy is geïnstalleerd",
          "mitmweb draait op mijn computer",
        ],
      },
      {
        title: "Stel proxy in op je telefoon",
        body: `
          <p>Zorg dat je telefoon en computer op hetzelfde wifi-netwerk zitten.</p>
          <ol class="wizard-list">
            <li>Ga op je telefoon naar wifi-instellingen → proxy → handmatig</li>
            <li>Vul het IP-adres van je computer in</li>
            <li>Poort: <strong>8080</strong></li>
            <li>Open in de browser van je telefoon <code>mitm.it</code> en installeer het certificaat</li>
          </ol>
        `,
        checklist: [
          "Proxy staat aan op mijn telefoon",
          "Het mitmproxy-certificaat is geïnstalleerd",
        ],
      },
      {
        title: "Log in via de AH-app",
        body: `
          <p>Open de <strong>Albert Heijn app</strong> op je telefoon en log opnieuw in (of forceer een token-refresh door de app te herstarten).</p>
          <p class="muted">Let op: gebruik van de AH-app kan je opgeslagen token later ongeldig maken.</p>
        `,
        checklist: [
          "Ik ben ingelogd in de AH-app",
        ],
      },
      {
        title: "Zoek het token-verzoek",
        body: `
          <p>In mitmweb, filter op <code>api.ah.nl</code> en zoek een van deze requests:</p>
          <ul class="wizard-list">
            <li><code>POST /mobile-auth/v1/auth/token/refresh</code></li>
            <li><code>POST /mobile-auth/v1/auth/token</code></li>
          </ul>
          <p>Open de <strong>response</strong> en zoek naar <code>refresh_token</code>.</p>
          <div class="wizard-example">
            <strong>Voorbeeld response:</strong>
            <pre class="code-block">{
  "access_token": "12345_abcdef...",
  "refresh_token": "uuid-hier",
  "expires_in": 7199
}</pre>
          </div>
        `,
        checklist: [
          "Ik heb het refresh_token veld gevonden",
        ],
      },
      {
        title: "Plak en activeer",
        type: "input-refresh",
      },
    ],
  },
  direct: {
    id: "direct",
    title: "Direct refresh token",
    subtitle: "Als je het token al hebt",
    steps: [
      {
        title: "Kies je methode",
        type: "method",
      },
      {
        title: "Plak je refresh token",
        type: "input-refresh",
        body: `
          <p>Heb je al een <code>refresh_token</code> (uit een eerdere sessie, script of export)? Plak die hieronder.</p>
          <p class="muted">Je kunt ook een volledige JSON-response plakken — we halen het token er automatisch uit.</p>
        `,
      },
    ],
  },
};

let wizardMethod = "browser";
let wizardStep = 0;
let wizardChecklist = {};
let wizardActivating = false;
let wizardDraftCode = "";
let wizardDraftRefresh = "";

function getWizardState() {
  const method = WIZARD_METHODS[wizardMethod];
  return {
    method,
    step: wizardStep,
    total: method.steps.length,
    current: method.steps[wizardStep],
  };
}

function loadWizardProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(WIZARD_STORAGE_KEY) || "{}");
    if (saved.method && WIZARD_METHODS[saved.method]) {
      wizardMethod = saved.method;
    }
    if (typeof saved.step === "number") {
      wizardStep = saved.step;
    }
    wizardChecklist = saved.checklist || {};
  } catch {
    wizardChecklist = {};
  }
}

function saveWizardProgress() {
  localStorage.setItem(
    WIZARD_STORAGE_KEY,
    JSON.stringify({
      method: wizardMethod,
      step: wizardStep,
      checklist: wizardChecklist,
    })
  );
}

function checklistKey(method, step, index) {
  return `${method}:${step}:${index}`;
}

function isChecklistComplete(method, stepIndex, stepDef) {
  if (!stepDef.checklist?.length) return true;
  return stepDef.checklist.every((_, index) =>
    wizardChecklist[checklistKey(method, stepIndex, index)]
  );
}

function extractRefreshToken(input) {
  const value = input.trim();
  if (!value) return "";

  if (value.startsWith("{")) {
    try {
      const json = JSON.parse(value);
      return json.refresh_token || json.refreshToken || "";
    } catch {
      return "";
    }
  }

  return value;
}

function validateCodeInput(value) {
  const code = extractCode(value);
  if (!code) return { ok: false, message: "Geen geldige code gevonden." };
  if (code.length < 8) return { ok: false, message: "De code lijkt te kort." };
  return { ok: true, code, message: "Code herkend — klaar om te activeren." };
}

function validateRefreshInput(value) {
  const token = extractRefreshToken(value);
  if (!token) return { ok: false, message: "Geen refresh token gevonden." };
  if (token.length < 16) return { ok: false, message: "Het token lijkt te kort." };
  return { ok: true, token, message: "Refresh token herkend — klaar om te activeren." };
}

function renderWizardProgress() {
  const { method, step, total } = getWizardState();
  const container = document.querySelector("#wizard-progress");
  if (!container) return;

  container.innerHTML = method.steps
    .map((item, index) => {
      const state =
        index < step ? "done" : index === step ? "active" : "pending";
      const label = index === 0 ? "Start" : String(index);
      return `<div class="wizard-progress-item ${state}" data-step="${index}">
        <span class="wizard-progress-dot">${index < step ? "✓" : label}</span>
        <span class="wizard-progress-label">${item.title}</span>
      </div>`;
    })
    .join("");

  container.querySelectorAll(".wizard-progress-item.done").forEach((el) => {
    el.addEventListener("click", () => {
      wizardStep = Number(el.dataset.step);
      saveWizardProgress();
      renderWizard();
    });
  });
}

function renderMethodCards() {
  return `<div class="wizard-methods">
    ${Object.values(WIZARD_METHODS)
      .map(
        (method) => `
        <button type="button" class="wizard-method-card ${
          wizardMethod === method.id ? "selected" : ""
        }" data-method="${method.id}">
          <strong>${method.title}</strong>
          <span class="muted">${method.subtitle}</span>
        </button>`
      )
      .join("")}
  </div>`;
}

function renderChecklist(methodId, stepIndex, items) {
  return `<div class="wizard-checklist">
    ${items
      .map(
        (label, index) => {
          const key = checklistKey(methodId, stepIndex, index);
          const checked = Boolean(wizardChecklist[key]);
          return `<label class="wizard-check-item">
            <input type="checkbox" data-check-key="${key}" ${checked ? "checked" : ""} />
            <span>${label}</span>
          </label>`;
        }
      )
      .join("")}
  </div>`;
}

function renderInputCodeStep() {
  const value = wizardDraftCode;
  const validation = value ? validateCodeInput(value) : null;

  return `
    <label class="wizard-input-label">
      Autorisatiecode of redirect-URL
      <textarea id="wizard-code-input" class="wizard-input" placeholder="appie://login-exit?code=..." ${wizardActivating ? "disabled" : ""}>${escapeHtml(value)}</textarea>
    </label>
    <div id="wizard-validation" class="wizard-validation ${
      validation ? (validation.ok ? "ok" : "error") : ""
    }">
      ${validation ? validation.message : "Plak je URL of code hierboven."}
    </div>
    <div class="actions" style="margin-top:1rem">
      <button type="button" class="btn btn-primary" id="wizard-activate-code" ${
        validation?.ok && !wizardActivating ? "" : "disabled"
      }>${wizardActivating ? "Bezig…" : "Token activeren"}</button>
    </div>
  `;
}

function renderInputRefreshStep() {
  const value = wizardDraftRefresh;
  const validation = value ? validateRefreshInput(value) : null;

  return `
    <label class="wizard-input-label">
      Refresh token of JSON-response
      <textarea id="wizard-refresh-input" class="wizard-input" placeholder='{"refresh_token":"..."} of alleen het token' ${wizardActivating ? "disabled" : ""}>${escapeHtml(value)}</textarea>
    </label>
    <div id="wizard-validation" class="wizard-validation ${
      validation ? (validation.ok ? "ok" : "error") : ""
    }">
      ${validation ? validation.message : "Plak je refresh token hierboven."}
    </div>
    <div class="actions" style="margin-top:1rem">
      <button type="button" class="btn btn-primary" id="wizard-activate-refresh" ${
        validation?.ok && !wizardActivating ? "" : "disabled"
      }>${wizardActivating ? "Bezig…" : "Token activeren"}</button>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderWizardActions(actions) {
  if (!actions?.length) return "";

  const actionMap = {
    "open-login": `<button type="button" class="btn btn-primary" id="wizard-open-login">Open AH-login</button>`,
    "copy-login-url": `<button type="button" class="btn btn-secondary" id="wizard-copy-login-url">Kopieer login-URL</button>`,
    "copy-mitm-command": `<button type="button" class="btn btn-secondary" id="wizard-copy-mitm">Kopieer installatiecommando</button>`,
  };

  return `<div class="actions wizard-step-actions">${actions
    .map((action) => actionMap[action] || "")
    .join("")}</div>`;
}

function renderWizard() {
  const container = document.querySelector("#wizard-content");
  if (!container) return;

  const { method, step, current } = getWizardState();
  renderWizardProgress();

  let html = "";

  if (current.type === "method") {
    html = `
      <h3>Hoe wil je je token aanleveren?</h3>
      <p class="muted" style="margin:0.75rem 0 1rem">Kies de methode die het beste bij je past. Je kunt later altijd wisselen.</p>
      ${renderMethodCards()}
    `;
  } else {
    html = `
      <h3>${current.title}</h3>
      ${current.body || ""}
      ${current.checklist ? renderChecklist(method.id, step, current.checklist) : ""}
      ${renderWizardActions(current.actions)}
    `;

    if (current.type === "input-code") {
      html += renderInputCodeStep();
    }
    if (current.type === "input-refresh") {
      html += renderInputRefreshStep();
    }
  }

  const canGoNext =
    current.type === "method" ||
    (current.type !== "input-code" &&
      current.type !== "input-refresh" &&
      isChecklistComplete(method.id, step, current));

  const footer = document.querySelector("#wizard-footer");
  if (footer) {
    footer.innerHTML = `
      <button type="button" class="btn btn-ghost" id="wizard-prev" ${
        step === 0 ? "disabled" : ""
      }>Vorige</button>
      <span class="wizard-step-count">Stap ${step + 1} van ${method.steps.length}</span>
      ${
        current.type === "input-code" || current.type === "input-refresh"
          ? ""
          : `<button type="button" class="btn btn-secondary" id="wizard-next" ${
              canGoNext ? "" : "disabled"
            }>${step === method.steps.length - 1 ? "Afronden" : "Volgende"}</button>`
      }
    `;
  }

  container.innerHTML = html;
  bindWizardEvents();
}

function bindWizardEvents() {
  document.querySelectorAll(".wizard-method-card").forEach((card) => {
    card.addEventListener("click", () => {
      wizardMethod = card.dataset.method;
      if (wizardStep === 0) {
        wizardStep = 1;
      }
      saveWizardProgress();
      renderWizard();
    });
  });

  document.querySelectorAll(".wizard-checklist input").forEach((input) => {
    input.addEventListener("change", () => {
      wizardChecklist[input.dataset.checkKey] = input.checked;
      saveWizardProgress();
      renderWizard();
    });
  });

  document.querySelector("#wizard-prev")?.addEventListener("click", () => {
    if (wizardStep > 0) {
      wizardStep -= 1;
      saveWizardProgress();
      renderWizard();
    }
  });

  document.querySelector("#wizard-next")?.addEventListener("click", () => {
    const { method } = getWizardState();
    if (wizardStep < method.steps.length - 1) {
      wizardStep += 1;
      saveWizardProgress();
      renderWizard();
    }
  });

  document.querySelector("#wizard-open-login")?.addEventListener("click", async () => {
    const { url } = await api("/api/auth/login-url");
    window.open(url, "_blank", "noopener");
  });

  document.querySelector("#wizard-copy-login-url")?.addEventListener("click", async () => {
    const { url } = await api("/api/auth/login-url");
    await copyText(url, "Login-URL gekopieerd.");
  });

  document.querySelector("#wizard-copy-mitm")?.addEventListener("click", () => {
    copyText("pip install mitmproxy\nmitmweb", "Commando gekopieerd.");
  });

  const codeInput = document.querySelector("#wizard-code-input");
  if (codeInput) {
    codeInput.addEventListener("input", () => {
      wizardDraftCode = codeInput.value;
      if (!wizardActivating) renderWizard();
    });
    document.querySelector("#wizard-activate-code")?.addEventListener("click", async () => {
      const validation = validateCodeInput(wizardDraftCode);
      if (!validation.ok || wizardActivating) return;
      await activateWizardCode(validation.code);
    });
  }

  const refreshInput = document.querySelector("#wizard-refresh-input");
  if (refreshInput) {
    refreshInput.addEventListener("input", () => {
      wizardDraftRefresh = refreshInput.value;
      if (!wizardActivating) renderWizard();
    });
    document.querySelector("#wizard-activate-refresh")?.addEventListener("click", async () => {
      const validation = validateRefreshInput(wizardDraftRefresh);
      if (!validation.ok || wizardActivating) return;
      await activateWizardRefresh(validation.token);
    });
  }
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showWizardToast(successMessage);
  } catch {
    showWizardToast("Kopiëren mislukt — selecteer de tekst handmatig.");
  }
}

function showWizardToast(message) {
  let toast = document.querySelector(".wizard-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "wizard-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

async function activateWizardCode(code) {
  wizardActivating = true;
  renderWizard();
  try {
    setWizardResult("loading", "Token ophalen…");
    const status = await api("/api/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    updateUiFromStatus(status);
    setWizardResult(
      "success",
      `Gelukt! Ingelogd als ${status.displayName || status.email || "AH-gebruiker"}.`
    );
    localStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch (error) {
    setWizardResult("error", error.message);
  } finally {
    wizardActivating = false;
    renderWizard();
  }
}

async function activateWizardRefresh(token) {
  wizardActivating = true;
  renderWizard();
  try {
    setWizardResult("loading", "Refresh token verwerken…");
    const status = await api("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: token }),
    });
    updateUiFromStatus(status);
    setWizardResult(
      "success",
      `Gelukt! Token actief${
        status.displayName ? ` voor ${status.displayName}` : ""
      }.`
    );
    localStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch (error) {
    setWizardResult("error", error.message);
  } finally {
    wizardActivating = false;
    renderWizard();
  }
}

function setWizardResult(type, message) {
  const box = document.querySelector("#wizard-result");
  if (!box) return;
  box.hidden = false;
  box.className = `wizard-result ${type}`;
  box.innerHTML =
    type === "loading"
      ? `<div class="spinner"></div><span>${message}</span>`
      : `<strong>${type === "success" ? "Succes" : "Fout"}</strong><p class="muted">${message}</p>`;
}

function initTokenWizard() {
  loadWizardProgress();
  renderWizard();
}

function resetTokenWizard() {
  wizardStep = 0;
  wizardChecklist = {};
  wizardActivating = false;
  wizardDraftCode = "";
  wizardDraftRefresh = "";
  localStorage.removeItem(WIZARD_STORAGE_KEY);
  const result = document.querySelector("#wizard-result");
  if (result) result.hidden = true;
  renderWizard();
}
