# Einsatztagebuch

Digitales Einsatztagebuch als Progressive Web App (PWA) – optimiert fürs iPhone,
läuft aber in jedem modernen Browser. Komplett serverlos: die App liegt statisch
auf GitHub Pages, alle Einträge bleiben **nur auf deinem Gerät**.

- Dienste & Einsätze mit Einsatzart, Statistikkennzahl, PZC, NACA, Blaulicht,
  weiteren Einsatzmitteln, Favoriten und SEG-Einsätzen
- Statistik (inkl. Ø Patientenalter aus dem PZC) und Jahres-Heatmap
- Optional: Dienstplan aus dem Online Dienstplan über einen eigenen
  Cloudflare Worker (derselbe wie bei [RKTel](https://github.com/VitusHg/rktel))
- Offline-fähig, helles/dunkles Design, iOS-Gesten (Wischen, Sheets)

## Veröffentlichen (GitHub Pages)

1. Repository auf **öffentlich** stellen (Settings → General → Danger Zone →
   *Change visibility*). Mit GitHub Pro geht Pages auch privat.
2. **Settings → Pages → Build and deployment**
   - *Source*: **Deploy from a branch**
   - *Branch*: den Branch mit diesem Stand (z. B. `main`) und Ordner **`/docs`**
   - *Save*
3. Nach ca. einer Minute ist die App erreichbar unter
   `https://vitushg.github.io/<repo-name>/`
4. Auf dem iPhone in **Safari** öffnen → *Teilen* → **Zum Home-Bildschirm**.
   Erst die Homescreen-App bekommt den dauerhaften, eigenen Speicher.

Der Ordner `docs/` ist die komplette App – kein Build-Schritt nötig.
`docs/.nojekyll` sorgt dafür, dass GitHub die Dateien unverändert ausliefert.

## Dienstplan (optional)

Der Browser darf den Kalender des Online Dienstplans wegen CORS nicht direkt
laden. Dafür gibt es einen kleinen Cloudflare Worker (kostenloser Tarif). Die
private Kalender-URL liegt dort als Secret – die App kennt nur die
Worker-Adresse und einen Zugangsschlüssel. Der Worker ist **kein offener
Proxy** und antwortet nur der eigenen GitHub-Pages-Herkunft.

### Variante A – RKTel-Worker mitbenutzen (empfohlen)

Läuft RKTel bereits unter `https://vitushg.github.io`, ist die Herkunft
dieselbe. In der App unter **Einstellungen → Dienstplan** einfach dieselbe
Worker-Adresse und denselben Zugangsschlüssel wie in RKTel eintragen →
*Speichern & laden*. Fertig.

### Variante B – eigener Worker (Ordner `worker/`)

```bash
cd worker
npx wrangler login
npx wrangler secret put ICS_URL        # privater Kalenderlink (https://dienstplan.st.roteskreuz.at/…)
npx wrangler secret put ACCESS_TOKEN   # mind. 32 Zeichen, z. B. in der App „Neuen Schlüssel erzeugen“
npx wrangler deploy
```

In `worker/wrangler.toml` ggf. `ALLOWED_ORIGINS` anpassen, falls die App unter
einer anderen Adresse als `https://vitushg.github.io` läuft.

Der Worker (`worker/src/index.js`) und die Kalender-Verarbeitung
(`docs/vendor/rk-dienstplan.js`, `docs/vendor/ical.min.js`) sind unverändert
aus RKTel übernommen – Zeitzonen, Serientermine und Ausnahmen werden dadurch
identisch behandelt.

## Daten & Sicherung

- Gespeichert wird im Browser-Speicher (localStorage) der jeweiligen
  **Adresse**. Safari-Tab und Homescreen-App haben getrennte Speicher.
- Beim **Umzug auf eine neue Adresse** (z. B. vom früheren Server auf GitHub
  Pages) wandern die Daten nicht automatisch mit:
  alte App → *Einstellungen → Daten & Backup → Daten exportieren* →
  neue App → *Daten importieren*.
- Homescreen-App vom iPhone löschen = Daten löschen. Den Export daher als
  echtes Backup behandeln; die App erinnert nach 30 Tagen ohne Sicherung.
- Der Zugangsschlüssel des Workers wird bewusst **nicht** exportiert.

Vorlagen für Stichwörter und PZC-Codes liegen in `data/` und lassen sich unter
*Einstellungen → Stichwörter & PZC → JSON importieren* laden.

## Entwicklung

Ein beliebiger statischer Webserver reicht, z. B.:

```bash
cd docs && python3 -m http.server 8080
```

Nach Änderungen an App-Dateien in `docs/sw.js` die `CACHE_NAME`-Version
erhöhen, damit installierte Apps das Update laden.
