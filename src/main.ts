import "./style.css";
import { buildCsv, copyText, dedupeAndSortSkus, isValidSku, makeSku, normalizeSku, outputFileName } from "./core";
import { extractPullList, PullListError } from "./extract";
import type { ExtractedSku, ExtractionResult, SkuSource } from "./types";

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}`);
  return value as T;
}

const dropZone = element<HTMLDivElement>("drop-zone");
const fileInput = element<HTMLInputElement>("pdf-input");
const progressPanel = element<HTMLDivElement>("progress-panel");
const progressTitle = element<HTMLHeadingElement>("progress-title");
const progressPercent = element<HTMLSpanElement>("progress-percent");
const progressBar = element<HTMLDivElement>("progress-bar");
const progressDetail = element<HTMLParagraphElement>("progress-detail");
const errorPanel = element<HTMLDivElement>("error-panel");
const errorMessage = element<HTMLParagraphElement>("error-message");
const resultsPanel = element<HTMLElement>("results-panel");
const resultCount = element<HTMLSpanElement>("result-count");
const actionCount = element<HTMLElement>("action-count");
const resultFile = element<HTMLParagraphElement>("result-file");
const warnings = element<HTMLDivElement>("warnings");
const warningList = element<HTMLUListElement>("warning-list");
const skuList = element<HTMLOListElement>("sku-list");
const addForm = element<HTMLFormElement>("add-form");
const newSkuInput = element<HTMLInputElement>("new-sku");
const addError = element<HTMLParagraphElement>("add-error");
const printMeta = element<HTMLParagraphElement>("print-meta");
const printList = element<HTMLOListElement>("print-list");
const toast = element<HTMLDivElement>("toast");

let currentResult: ExtractionResult | null = null;
let currentSkus: ExtractedSku[] = [];
let busy = false;
let toastTimer = 0;

const sourceLabels: Record<SkuSource, string> = {
  "pdf-text": "PDF text",
  ocr: "OCR",
  manual: "Manual",
};

function setHidden(target: HTMLElement, hidden: boolean): void {
  target.hidden = hidden;
}

function showToast(message: string): void {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

function updatePrintView(): void {
  if (!currentResult) return;
  const now = new Date();
  printMeta.textContent = `${currentResult.fileName} · ${now.toLocaleDateString()} · ${currentSkus.length} unique item numbers`;
  printList.innerHTML = currentSkus.map((sku) => `<li>${escapeHtml(sku.value)}</li>`).join("");
}

function renderResults(): void {
  currentSkus = dedupeAndSortSkus(currentSkus);
  const count = String(currentSkus.length);
  resultCount.textContent = count;
  actionCount.textContent = count;
  skuList.innerHTML = currentSkus
    .map(
      (sku, index) => `
        <li data-id="${escapeHtml(sku.id)}">
          <span class="row-number">${String(index + 1).padStart(2, "0")}</span>
          <label>
            <span class="sr-only">Item number ${index + 1}</span>
            <input class="sku-input" value="${escapeHtml(sku.value)}" maxlength="9" spellcheck="false" />
          </label>
          <span class="source-badge source-${sku.source}">${sourceLabels[sku.source]}${sku.page ? ` · p${sku.page}` : ""}</span>
          <button class="remove-button" type="button" aria-label="Remove ${escapeHtml(sku.value)}">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17" /></svg>
          </button>
        </li>`,
    )
    .join("");
  updatePrintView();
}

function reset(): void {
  busy = false;
  currentResult = null;
  currentSkus = [];
  fileInput.value = "";
  dropZone.classList.remove("is-dragging");
  setHidden(dropZone, false);
  setHidden(progressPanel, true);
  setHidden(errorPanel, true);
  setHidden(resultsPanel, true);
  addError.textContent = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showError(error: unknown): void {
  const fallback = "Something went wrong while reading that PDF. Please try another file.";
  errorMessage.textContent = error instanceof PullListError ? error.message : fallback;
  setHidden(progressPanel, true);
  setHidden(resultsPanel, true);
  setHidden(errorPanel, false);
  busy = false;
}

async function processFile(file: File): Promise<void> {
  if (busy) return;
  busy = true;
  setHidden(dropZone, true);
  setHidden(errorPanel, true);
  setHidden(resultsPanel, true);
  setHidden(progressPanel, false);
  progressBar.style.width = "0%";
  progressPercent.textContent = "0%";
  progressTitle.textContent = "Reading PDF…";
  progressDetail.textContent = file.name;

  try {
    const result = await extractPullList(file, (progress) => {
      progressBar.style.width = `${progress.percent}%`;
      progressPercent.textContent = `${progress.percent}%`;
      progressTitle.textContent = progress.phase === "ocr" || progress.phase === "loading-ocr" ? "Reading scanned page…" : "Reading PDF…";
      progressDetail.textContent = progress.message;
    });
    currentResult = result;
    currentSkus = result.skus;
    resultFile.textContent = `${result.fileName} · ${result.pageCount} ${result.pageCount === 1 ? "page" : "pages"} · ${(result.elapsedMs / 1000).toFixed(2)}s`;
    warningList.innerHTML = result.warnings.map((warning) => `<li>${escapeHtml(warning.message)}</li>`).join("");
    setHidden(warnings, result.warnings.length === 0);
    renderResults();
    setHidden(progressPanel, true);
    setHidden(resultsPanel, false);
    resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
  }
}

async function copyToClipboard(): Promise<void> {
  if (!currentSkus.length) return;
  const text = copyText(currentSkus);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  const label = element<HTMLSpanElement>("copy-button").querySelector("span");
  if (label) {
    label.textContent = "Copied";
    window.setTimeout(() => (label.textContent = "Copy"), 1800);
  }
  showToast(`${currentSkus.length} item numbers copied`);
}

function downloadCsv(): void {
  if (!currentSkus.length) return;
  const blob = new Blob([buildCsv(currentSkus)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = outputFileName();
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`Downloaded ${anchor.download}`);
}

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});
for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
}
dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files[0];
  if (file) void processFile(file);
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void processFile(file);
});

skuList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".remove-button");
  const row = button?.closest<HTMLLIElement>("li[data-id]");
  if (!row) return;
  currentSkus = currentSkus.filter((sku) => sku.id !== row.dataset.id);
  renderResults();
  if (!currentSkus.length) showToast("Add an item number before exporting");
});

skuList.addEventListener("change", (event) => {
  const input = (event.target as HTMLElement).closest<HTMLInputElement>(".sku-input");
  const row = input?.closest<HTMLLIElement>("li[data-id]");
  if (!input || !row) return;
  const value = normalizeSku(input.value);
  if (!isValidSku(value)) {
    input.setCustomValidity("Use 2–5 letters or numbers, a hyphen, then 2–3 digits.");
    input.reportValidity();
    const existing = currentSkus.find((sku) => sku.id === row.dataset.id);
    input.value = existing?.value ?? "";
    return;
  }
  input.setCustomValidity("");
  currentSkus = currentSkus.map((sku) => (sku.id === row.dataset.id ? { ...sku, value } : sku));
  renderResults();
});

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = normalizeSku(newSkuInput.value);
  if (!isValidSku(value)) {
    addError.textContent = "Use 2–5 letters or numbers, a hyphen, then 2–3 digits.";
    newSkuInput.focus();
    return;
  }
  if (currentSkus.some((sku) => sku.value === value)) {
    addError.textContent = `${value} is already in the list.`;
    newSkuInput.focus();
    return;
  }
  currentSkus.push(makeSku(value, "manual"));
  addError.textContent = "";
  newSkuInput.value = "";
  renderResults();
  showToast(`${value} added`);
});

element<HTMLButtonElement>("copy-button").addEventListener("click", () => void copyToClipboard());
element<HTMLButtonElement>("download-button").addEventListener("click", downloadCsv);
element<HTMLButtonElement>("print-button").addEventListener("click", () => {
  updatePrintView();
  window.print();
});
element<HTMLButtonElement>("reset-button").addEventListener("click", reset);
element<HTMLButtonElement>("error-reset").addEventListener("click", reset);
