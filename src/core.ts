import type { ExtractedSku, SkuSource } from "./types";

export const SKU_FORMAT = /^[A-Z0-9]{2,5}-\d{2,3}$/;
const SKU_SEARCH = /(?:^|[^A-Z0-9])([A-Z0-9]{2,5}-\d{2,3})(?![A-Z0-9-])/gi;
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidSku(value: string): boolean {
  return SKU_FORMAT.test(normalizeSku(value));
}

export function extractSkuValues(text: string): string[] {
  const matches: string[] = [];
  const seen = new Set<string>();
  SKU_SEARCH.lastIndex = 0;

  for (let match = SKU_SEARCH.exec(text); match; match = SKU_SEARCH.exec(text)) {
    const value = normalizeSku(match[1]);
    if (!seen.has(value)) {
      seen.add(value);
      matches.push(value);
    }
  }

  return matches;
}

export function makeSku(
  value: string,
  source: SkuSource,
  page?: number,
  confidence?: number,
): ExtractedSku {
  const normalized = normalizeSku(value);
  return {
    id: `${source}-${page ?? "manual"}-${normalized}-${crypto.randomUUID()}`,
    value: normalized,
    source,
    ...(page ? { page } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
  };
}

export function dedupeAndSortSkus(skus: ExtractedSku[]): ExtractedSku[] {
  const unique = new Map<string, ExtractedSku>();
  for (const sku of skus) {
    const value = normalizeSku(sku.value);
    if (isValidSku(value) && !unique.has(value)) {
      unique.set(value, { ...sku, value });
    }
  }

  return [...unique.values()].sort((a, b) => collator.compare(a.value, b.value));
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildCsv(skus: ExtractedSku[]): string {
  const rows = dedupeAndSortSkus(skus).map((sku) => csvCell(sku.value));
  return ["Item #", ...rows].join("\r\n") + "\r\n";
}

export function outputFileName(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}_item_numbers_only.csv`;
}

export function copyText(skus: ExtractedSku[]): string {
  return dedupeAndSortSkus(skus).map((sku) => sku.value).join("\n");
}
