let hassLoaded = false;

function escapeHtmlHass(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderHassLoading() {
  const container = document.querySelector("#hass-content");
  if (!container) return;
  container.innerHTML = `
    <div class="loading-box card" style="padding:2rem">
      <div class="spinner"></div>
      <strong>HACS-pakket laden…</strong>
    </div>
  `;
}

function renderHassPage(info) {
  const container = document.querySelector("#hass-content");
  if (!container) return;

  const loginUrl =
    "https://login.ah.nl/secure/oauth/authorize?client_id=appie&redirect_uri=appie%3A%2F%2Flogin-exit&response_type=code";

  container.innerHTML = `
    <div class="hero fin-hero">
      <div>
        <h2>Home Assistant</h2>
        <p class="muted">Standalone HACS-integratie — geen Docker backend nodig. Praat direct met api.ah.nl.</p>
      </div>
    </div>

    <section class="card hass-download-card">
      <h3>HACS-pakket downloaden (v${escapeHtmlHass(info.version)})</h3>
      <p class="muted">Integratie <code>albert_heijn</code> — sensoren, premium, bonus activeren</p>
      <div class="actions" style="margin-top:1rem">
        <a class="btn btn-primary" href="${escapeHtmlHass(info.downloadUrl)}">Download ZIP</a>
      </div>
    </section>

    <section class="card">
      <h3>Installatie</h3>
      <ol class="hass-steps">
        <li>Download en pak de ZIP uit in je HA <code>config/</code> map (<code>custom_components/albert_heijn/</code>).</li>
        <li>Herstart Home Assistant.</li>
        <li><strong>Instellingen → Integraties → Albert Heijn Explorer toevoegen</strong></li>
        <li>Open de login-link:
          <p><a href="${escapeHtmlHass(loginUrl)}" target="_blank" rel="noopener">${escapeHtmlHass(loginUrl)}</a></p>
        </li>
        <li>Log in. Je browser toont een fout met <code>appie://login-exit?code=…</code> — <strong>dat is normaal</strong>.</li>
        <li>Kopieer de volledige <code>appie://</code> URL en plak die in Home Assistant.</li>
      </ol>
    </section>

    <section class="card">
      <h3>Wat krijg je in HA?</h3>
      <div class="hass-sensor-grid">
        <span>Premium (ja/nee)</span>
        <span>Koopzegels</span>
        <span>Air Miles</span>
        <span>Boodschappenlijst</span>
        <span>Bonus activeerbaar</span>
        <span>Bonus over deze week</span>
      </div>
      <p class="muted" style="margin-top:0.75rem">
        Knoppen: <strong>Bonusbox alles activeren</strong>, <strong>Persoonlijke bonus alles activeren</strong>, vernieuwen.
      </p>
      <p class="muted">
        Service: <code>albert_heijn.activate_bonus</code> voor één specifieke aanbieding.
      </p>
    </section>

    <section class="card">
      <h3>Voorbeeld automatisering</h3>
      <pre class="hass-yaml">service: albert_heijn.activate_all_bonus
data:
  config_entry: JOUW_ENTRY_ID
  source: bonusbox</pre>
    </section>

    <section class="card">
      <h3>Volledige webapp (optioneel)</h3>
      <p class="muted">
        Wil je ook Financieel, Lijst beheren en Koopjes? Draai dan nog steeds de Docker-app op poort 38472.
        De HACS-integratie werkt daar los van.
      </p>
    </section>
  `;

  hassLoaded = true;
}

async function loadHass(force = false) {
  if (hassLoaded && !force) return;
  renderHassLoading();

  try {
    const info = await api("/api/hacs/info");
    renderHassPage(info);
  } catch (error) {
    document.querySelector("#hass-content").innerHTML = `
      <div class="mijn-ah-error card">
        <strong>HACS-info kon niet worden geladen</strong>
        <p class="muted">${escapeHtmlHass(error.message)}</p>
      </div>
    `;
  }
}

function initHass() {
  loadHass();
}
