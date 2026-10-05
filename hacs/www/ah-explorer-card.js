class AhExplorerCard extends HTMLElement {
  static getConfigElement() {
    const el = document.createElement("div");
    el.innerHTML = `
      <p>Volledige AH Explorer in je dashboard (iframe).</p>
      <p class="muted">Log eerst in via de explorer op dezelfde URL.</p>
    `;
    return el;
  }

  static getStubConfig() {
    return {
      url: "http://localhost:38472",
      height: 900,
      page: "",
      hide_sidebar: true,
    };
  }

  setConfig(config) {
    if (!config?.url) {
      throw new Error("Stel een url in (bijv. http://192.168.1.10:38472)");
    }
    this._config = {
      height: 900,
      page: "",
      hide_sidebar: true,
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    const entry = Object.values(hass.states).find(
      (state) => state.entity_id.startsWith("sensor.") && state.attributes?.device_class === undefined
    );
    if (!this._config?.url && entry?.attributes?.backend_url) {
      this._config = { ...this._config, url: entry.attributes.backend_url };
    }
    this._render();
  }

  getCardSize() {
    return 12;
  }

  _buildSrc() {
    const base = String(this._config.url).replace(/\/$/, "");
    const params = new URLSearchParams();
    if (this._config.hide_sidebar) params.set("embed", "1");
    const query = params.toString();
    const hash = this._config.page ? `#${this._config.page}` : "";
    return `${base}${query ? `?${query}` : ""}${hash}`;
  }

  _render() {
    if (!this._config) return;
    const height = Number(this._config.height) || 900;
    const src = this._buildSrc();
    this.innerHTML = `
      <ha-card header="Albert Heijn Explorer">
        <div class="card-content" style="padding:0;overflow:hidden">
          <iframe
            title="AH Explorer"
            src="${src}"
            style="width:100%;height:${height}px;border:0;display:block;background:#f6f8f7"
            loading="lazy"
            allow="clipboard-read; clipboard-write"
          ></iframe>
        </div>
      </ha-card>
    `;
  }
}

customElements.define("ah-explorer-card", AhExplorerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "ah-explorer-card",
  name: "AH Explorer Panel",
  description: "Volledige Albert Heijn Explorer (Mijn AH, Financieel, Lijst, Koopjes)",
  preview: true,
  documentationURL: "https://github.com/NickBouwhuis/Albert-Heijn-OpenAPI",
});
