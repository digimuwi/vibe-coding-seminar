# comesser

Interactive viewer, annotator, and guided tour for Giovanni Girolamo Kapsperger's lute intabulation of Carlo Gesualdo's madrigal *"Come esser può ch'io viva"*.

**Live site:** https://pfefferniels.github.io/comesser/

## Contents

- **`index.html`** — viewer with synchronized playback, annotation overlay, and a guided tour through the intabulation.
- **`editor.html`** — annotator for marking passages on the score and exporting annotations as JSON.
- **`comesser-merged.mei`** — MEI encoding of the score (vocal model + lute intabulation), rendered with [Verovio](https://www.verovio.org/).
- **`kapsberger-annotations.json`** — analytical annotations on Kapsperger's intabulation choices.
- **`tour.json`** — ordered steps for the guided walkthrough.

## Running locally

The project is a static site — no build step. Serve the directory with any local web server:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Deployment

Deployed via GitHub Pages from the `main` branch root.
