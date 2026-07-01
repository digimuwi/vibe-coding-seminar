# Noten-Manager & Customizer (Rework Sheetmusic)

Dieses Projekt ist eine plattformunabhängige Webapplikation, die eingescannte Notenblätter (PDFs oder Bilder) mittels **Audiveris (OMR)** in **MusicXML** konvertiert, die Noten im Browser via **OpenSheetMusicDisplay (OSMD)** anzeigt und es erlaubt, das Layout (Notengröße, Zeilenumbrüche, Seitenumbrüche, etc.) stufenlos anzupassen und als PDF zu exportieren.

Die App ist für die Ausführung auf einem lokalen PC sowie zur langfristigen Bereitstellung auf einem **Raspberry Pi 4 Model B** konzipiert, sodass der Zugriff bequem mobil (z.B. über ein Tablet auf dem Notenständer) erfolgen kann.

---

## Features

- **OMR-Scanning:** Konvertiert PDF, PNG, JPG, TIFF in digitales MusicXML mittels Audiveris.
- **Projekt-Bibliothek:** Speichert gescannte Noten im internen Ordner `public/library/` ab. Ein erneutes Scannen ist nicht notwendig – einmal digitalisiert, können Projekte jederzeit geladen werden.
- **Erweiterbares Einstellungs-System:** Modularer `SettingsManager` im Frontend für stufenlose Notenskalierung, Zeilenabstand und mehr.
- **Takt-Manager:** Granulare Kontrolle über Zeilen- (System) und Seitenumbrüche nach jedem Takt per Klick.
- **Remote & Mobilfähig:** Lauscht auf allen Netzwerkschnittstellen. Zugriff über die lokale IP-Adresse im WLAN möglich.
- **Vektorbasiertes Druck-Layout:** Optimierte CSS-Regeln für gestochen scharfen PDF-Export.
- **Mock-Modus:** Testen aller Features und Layout-Einstellungen direkt im Browser mit Demodaten ohne Audiveris-Installation.

---

## Voraussetzungen

### 1. Node.js
Stelle sicher, dass **Node.js** (Version 16 oder neuer) installiert ist.

### 2. Audiveris CLI (für OMR-Scan)
Das System ruft Audiveris über die Befehlszeile auf. Dafür wird Java benötigt:
- **Java JRE/JDK:** Installiere Java JDK 17 oder höher.
- **Audiveris CLI:**
  - **Windows:** Trage den Pfad zur `Audiveris.bat` in die System-Umgebungsvariable `PATH` ein, oder passe den Pfad in der `server.js` an.
  - **Linux / Raspberry Pi:** Installiere Audiveris über deinen Paketmanager oder lade es herunter und stelle sicher, dass der Befehl `audiveris` im Terminal global ausführbar ist.

---

## Installation & Start

1. Öffne ein Terminal im Ordner `sheetmusic_editor/rework_sheetmusik`.
2. Installiere die Abhängigkeiten:
   ```bash
   npm install
   ```
3. Starte den Server:
   ```bash
   npm start
   ```
4. Öffne den Browser unter:
   - Lokal: [http://localhost:8082](http://localhost:8082)
   - Mobilgerät im selben WLAN: `http://<IP-DEINES-PCS-ODER-PIS>:8082`

---

## Remote-Zugriff einrichten (z. B. auf Raspberry Pi)

Um die App auf einem Tablet oder Smartphone im selben WLAN-Netzwerk zu verwenden:
1. Ermittle die IP-Adresse des Host-Systems (PC oder Raspberry Pi):
   - Windows: `ipconfig` im Terminal ausführen.
   - Linux / Raspberry Pi: `hostname -I` im Terminal ausführen.
2. Der Server bindet sich an `0.0.0.0` und ist unter `http://<IP-Adresse>:8082` erreichbar.
