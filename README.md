# EKG-Trainer

Übungswerkzeug für das 12-Kanal-EKG: synthetische, aber an echten Daten kalibrierte EKGs, Host-Modus für Gruppen, Beamer-Ansicht, Zeichnen und Messen, 3D-Erregungsleitung.
**Nur für Schulungszwecke – keine echten Patientendaten, nicht für die Diagnostik.**

## Aufbau
| Ordner | Inhalt |
|---|---|
| `engine/` | `ekg-engine.js` (Generator, 42 Befunde / 121 Varianten) und `ekg-lib.js` (Formbibliothek aus PTB-XL+) |
| `web/` | Oberfläche: `host.html` (Steuerpult), `beamer.html`, `index.html` (Teilnehmer), `viewer.js`, `heart3d.js`, `common.js` |
| `server/` | Lokaler Server (Rust). Die Dateien aus `web/` sind eingebaut → eine einzige Programmdatei |
| `online/` | Online-Räume (Cloudflare Worker + Durable Object), gleiche Nachrichten wie der lokale Server |
| `tools/kalibrierung/` | Anpassung an PTB-XL+ und die Vergleichstests |

Nach Änderungen an der Engine: `cp engine/*.js web/` und `cp web/{index.html,app.css,common.js,viewer.js} online/public/`.

## Starten (Host)
`cargo run --release --manifest-path server/Cargo.toml` – das Steuerpult öffnet sich im Browser (`http://localhost:47800/host`).
Teilnehmer scannen den QR-Code (gleiches WLAN). Steuerpult, Generator und Lösungen sind nur vom Host-Computer aus abrufbar; Teilnehmer bekommen fertige Kurven.

## Online-Räume
`cd online && npx wrangler deploy` (Cloudflare-Konto, Gratis-Tarif). Die https-Adresse im Steuerpult unter „Teilnehmer einladen“ eintragen.

## Programmdateien bauen
GitHub Actions (`.github/workflows/build.yml`) baut Windows, macOS und Linux bei einem Tag `v*` oder von Hand.

## Engine
`LeitWerkECG.generateECG(befund, seed, {variant, dur, clean, vector})` → Ableitungen (mV, 500 Hz), QRS-/Vorhofereignisse, Messwerte, Gerätebefund, Lösung.
- Ableitungen über die Dower-Matrix; P-Welle je Ableitung aus der Bibliothek.
- Unauffällige Grundform: echter, angepasster Patient aus PTB-XL+ (1 075 Normal-, 305 LSB-, 156 RSB-Formen) plus leichte Variation.
- Befunde verändern den Herzvektor (Verletzungsvektoren, Q-Zacken, Blöcke, Rhythmus).

## Quellen und Lizenzen
- PTB-XL (Wagner et al., Scientific Data 2020) und PTB-XL+ (Strodthoff et al., 2023), PhysioNet, CC BY 4.0 – daraus abgeleitete Formparameter in `engine/ekg-lib.js`.
- Dower-Matrix (Dower et al.; inverse Dower nach Edenbrandt & Pahlm).
- three.js r128 (MIT), qrcode-generator (MIT).
