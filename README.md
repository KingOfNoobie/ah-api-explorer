# AH API Explorer

Lokale explorer voor de Albert Heijn mobile API: inloggen, Mijn AH, financieel overzicht, boodschappenlijst, bonus, koopjes en een Home Assistant-integratie.

Gebaseerd op de OpenAPI-spec van [NickBouwhuis/Albert-Heijn-OpenAPI](https://github.com/NickBouwhuis/Albert-Heijn-OpenAPI).

## Starten

```bash
docker compose up --build
```

Open daarna: [http://localhost:38472](http://localhost:38472)

## Onderdelen

| Onderdeel | Beschrijving |
|-----------|--------------|
| **Mijn AH** | Profiel, Air Miles, koopzegels, bonusbox, bonnetjes |
| **Financieel** | Maandoverzicht uitgaven en kortingen |
| **Lijst** | Boodschappenlijst zoeken/beheren |
| **Bonus** | Bonus per categorie (live metadata) |
| **Koopjes** | Laatste-kans producten per winkel |
| **Home Assistant** | HACS-integratie + Lovelace card |
| **Swagger UI** | Interactieve API-docs via proxy |

## Belangrijk

- Dit is **geen** officiële AH API.
- Tokens worden lokaal opgeslagen in `data/session.json` (staat in `.gitignore`).
- Gebruik op eigen risico.

## Structuur

```
backend/     Node/Express API naar api.ah.nl
frontend/    nginx + vanilla JS UI
hacs/        Home Assistant custom component
nginx/       Reverse proxy + Swagger proxy
Albert-Heijn-OpenAPI/  OpenAPI-spec (upstream)
```
