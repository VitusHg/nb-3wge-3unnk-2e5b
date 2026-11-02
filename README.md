# Einsatztagebuch

Persönliche PWA. Die App liegt in `docs/` (GitHub Pages: Branch `main`, Ordner `/docs`).
Daten bleiben nur auf dem Gerät.

- `worker/` – optionaler Cloudflare Worker für den Dienstplan
  (Secrets `ICS_URL`, `ACCESS_TOKEN` per `npx wrangler secret put`)
- `data/` – Vorlagen für Stichwörter/PZC zum Import

Nach Änderungen in `docs/sw.js` die `CACHE_NAME`-Version erhöhen.

## Benachrichtigungen bei Dienstplan-Änderungen

Der Worker prüft den Kalender alle 10 Minuten und schickt bei neuen,
geänderten oder ausgefallenen Diensten eine Mitteilung (Web Push). Der Code in
`worker/src/index.js` ist zu RKTel kompatibel – der RKTel-Worker kann einfach
damit ersetzt werden.

Im Cloudflare-Dashboard beim Worker:

1. Code aus `worker/src/index.js` einfügen → *Deploy*.
2. *Storage & Databases → KV* → Namespace anlegen (z. B. `etb-push`).
3. Worker → *Settings → Bindings → Add → KV namespace*: Name **`PUSH_KV`**, den Namespace wählen.
4. Worker → *Settings → Trigger Events → Add → Cron Triggers*: `*/10 * * * *`.
5. iPhone: App vom Home-Bildschirm öffnen → *Einstellungen → Dienstplan →
   Bei Änderungen benachrichtigen* (ab iOS 16.4, nur in der Home-Bildschirm-App).

Mit wrangler: `npx wrangler kv namespace create PUSH_KV`, die id in
`worker/wrangler.toml` eintragen, `npx wrangler deploy` (Cron steht schon drin).
