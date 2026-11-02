# Einsatztagebuch

Persönliche PWA. Die App liegt in `docs/` (GitHub Pages: Branch `main`, Ordner `/docs`).
Daten bleiben nur auf dem Gerät.

- `worker/` – optionaler Cloudflare Worker für den Dienstplan
  (Secrets `ICS_URL`, `ACCESS_TOKEN` per `npx wrangler secret put`)
- `data/` – Vorlagen für Stichwörter/PZC zum Import

Nach Änderungen in `docs/sw.js` die `CACHE_NAME`-Version erhöhen.
