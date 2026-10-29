# Pull List Sorter 2.0

A static, browser-based ShipStation Product Pick List sorter. It extracts item numbers locally, removes duplicates, applies natural numeric ordering, and provides editable copy, CSV, and print outputs.

Live on GitHub Pages: https://sampollock.github.io/pull-list-sorter/

## Privacy and architecture

- PDFs are processed in the browser and are never uploaded.
- PDF.js reads embedded text first.
- Tesseract.js is lazy-loaded only for pages without usable embedded text.
- The OCR worker, WebAssembly core, and English language model are self-hosted with the app.
- There is no backend, database, account, analytics, or persistent document storage.

## Development

```bash
npm install
npm run dev
```

Run the checks and production build with:

```bash
npm run check
```

`npm run prepare:ocr` copies the installed Tesseract browser assets into the ignored `public/tesseract/` directory. Vite then includes those assets in `dist/`.

## SKU contract

The accepted item number format is 2–5 letters or numbers, a hyphen, and 2–3 digits. Values are normalized to uppercase, deduplicated, and sorted with numeric-aware natural ordering.

CSV output preserves the 1.0 contract:

```text
Item #
026-047
527-002
```

## Legacy version

The original Python script, launcher, and instructions are preserved in `legacy/v1/`. They are not included in the deployed website.

## Deployment

Pushes to `main` are tested, built, and deployed to GitHub Pages by `.github/workflows/pages.yml`. Real pull-list PDFs are intentionally excluded from the public repository.
