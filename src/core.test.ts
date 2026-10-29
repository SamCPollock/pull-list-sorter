import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCsv, dedupeAndSortSkus, extractSkuValues, isValidSku, makeSku, normalizeSku, outputFileName } from "./core";

describe("SKU rules", () => {
  it("normalizes and validates the supported format", () => {
    assert.equal(normalizeSku(" bes-220 "), "BES-220");
    assert.equal(isValidSku("026-047"), true);
    assert.equal(isValidSku("BES-220"), true);
    assert.equal(isValidSku("BES220"), false);
    assert.equal(isValidSku("TOOLONG-22"), false);
  });

  it("extracts complete tokens without matching UUID fragments", () => {
    const text = "9127-66 uuid: 123e4567-e89b-12d3-a456-426614174000 BES-220";
    assert.deepEqual(extractSkuValues(text), ["9127-66", "BES-220"]);
  });

  it("deduplicates and uses natural numeric ordering", () => {
    const sorted = dedupeAndSortSkus([
      makeSku("BES-220", "manual"),
      makeSku("1025-16", "manual"),
      makeSku("703-010", "manual"),
      makeSku("026-047", "manual"),
      makeSku("527-002", "manual"),
      makeSku("bes-220", "manual"),
    ]);
    assert.deepEqual(sorted.map((sku) => sku.value), [
      "026-047",
      "527-002",
      "703-010",
      "1025-16",
      "BES-220",
    ]);
  });
});

describe("exports", () => {
  it("builds the legacy one-column CSV contract", () => {
    const csv = buildCsv([makeSku("9127-66", "manual"), makeSku("BES-220", "manual")]);
    assert.equal(csv, "Item #\r\n9127-66\r\nBES-220\r\n");
  });

  it("uses a local calendar date in the file name", () => {
    assert.equal(outputFileName(new Date(2026, 9, 29)), "2026-10-29_item_numbers_only.csv");
  });
});
