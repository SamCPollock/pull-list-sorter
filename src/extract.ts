import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type PDFDocumentLoadingTask,
  type PDFPageProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { dedupeAndSortSkus, extractSkuValues, makeSku } from "./core";
import type {
  ExtractedSku,
  ExtractionProgress,
  ExtractionResult,
  ExtractionWarning,
} from "./types";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_USABLE_TEXT_LENGTH = 20;

export class PullListError extends Error {
  constructor(
    public readonly code: "invalid-file" | "encrypted" | "unreadable" | "no-skus" | "ocr-failed",
    message: string,
  ) {
    super(message);
    this.name = "PullListError";
  }
}

function emit(
  onProgress: ((progress: ExtractionProgress) => void) | undefined,
  phase: ExtractionProgress["phase"],
  percent: number,
  message: string,
): void {
  onProgress?.({ phase, percent: Math.max(0, Math.min(100, Math.round(percent))), message });
}

async function assertPdf(file: File): Promise<void> {
  if (!file || (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf")) {
    throw new PullListError("invalid-file", "Choose a PDF exported from ShipStation.");
  }
  if (file.size === 0) {
    throw new PullListError("invalid-file", "That PDF is empty. Export the pull list again and retry.");
  }
  const signature = new TextDecoder("ascii").decode(await file.slice(0, 5).arrayBuffer());
  if (signature !== "%PDF-") {
    throw new PullListError("invalid-file", "That file does not appear to be a valid PDF.");
  }
}

async function pageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  return content.items
    .filter((item): item is Extract<(typeof content.items)[number], { str: string }> => "str" in item)
    .map((item) => item.str)
    .join("\n");
}

function baseAssetUrl(path: string): string {
  return new URL(path, `${window.location.origin}${import.meta.env.BASE_URL}`).toString();
}

async function renderForOcr(page: PDFPageProxy): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: 2.2 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new PullListError("ocr-failed", "This browser could not prepare the scanned page for OCR.");
  }
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas;
}

async function recognizePages(
  pdf: PDFDocumentProxy,
  pageNumbers: number[],
  onProgress?: (progress: ExtractionProgress) => void,
): Promise<{ skus: ExtractedSku[]; warnings: ExtractionWarning[] }> {
  emit(onProgress, "loading-ocr", 62, "Loading the local OCR engine…");

  try {
    const { createWorker, OEM } = await import("tesseract.js");
    let recognizingPages = false;
    const worker = await createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: baseAssetUrl("tesseract/worker.min.js"),
      corePath: baseAssetUrl("tesseract/core"),
      langPath: baseAssetUrl("tesseract/lang"),
      gzip: true,
      logger(message) {
        if (!recognizingPages && typeof message.progress === "number" && pageNumbers.length) {
          emit(
            onProgress,
            "loading-ocr",
            62 + message.progress * 7,
            message.status ? `Preparing OCR: ${message.status}` : "Preparing OCR…",
          );
        }
      },
    });
    recognizingPages = true;

    const skus: ExtractedSku[] = [];
    const warnings: ExtractionWarning[] = [
      {
        code: "ocr-used",
        message: `OCR was used on ${pageNumbers.length} ${pageNumbers.length === 1 ? "page" : "pages"}. Review those item numbers before exporting.`,
      },
    ];

    try {
      for (const [index, pageNumber] of pageNumbers.entries()) {
        const page = await pdf.getPage(pageNumber);
        const canvas = await renderForOcr(page);
        emit(
          onProgress,
          "ocr",
          70 + (index / pageNumbers.length) * 25,
          `Reading scanned page ${pageNumber} of ${pdf.numPages}…`,
        );
        const result = await worker.recognize(canvas);
        const values = extractSkuValues(result.data.text);
        for (const value of values) {
          skus.push(makeSku(value, "ocr", pageNumber, result.data.confidence));
        }
        if (!values.length) {
          warnings.push({
            code: "ocr-no-skus",
            page: pageNumber,
            message: `No item numbers were recognized on scanned page ${pageNumber}.`,
          });
        }
        page.cleanup();
        canvas.width = 1;
        canvas.height = 1;
      }
    } finally {
      await worker.terminate();
    }

    return { skus, warnings };
  } catch (error) {
    if (error instanceof PullListError) throw error;
    throw new PullListError(
      "ocr-failed",
      "The local OCR engine could not read an image-only page. Check your connection, then try again.",
    );
  }
}

export async function extractPullList(
  file: File,
  onProgress?: (progress: ExtractionProgress) => void,
): Promise<ExtractionResult> {
  const startedAt = performance.now();
  await assertPdf(file);
  emit(onProgress, "reading", 2, "Opening the PDF locally…");

  let pdf: PDFDocumentProxy | undefined;
  let loadingTask: PDFDocumentLoadingTask | undefined;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    loadingTask = getDocument({ data });
    loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (total > 0) emit(onProgress, "reading", 2 + (loaded / total) * 6, "Opening the PDF locally…");
    };
    pdf = await loadingTask.promise;

    const skus: ExtractedSku[] = [];
    const warnings: ExtractionWarning[] = [];
    const ocrPages: number[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      emit(
        onProgress,
        "text",
        10 + ((pageNumber - 1) / pdf.numPages) * 48,
        `Reading page ${pageNumber} of ${pdf.numPages}…`,
      );
      const page = await pdf.getPage(pageNumber);
      const text = await pageText(page);
      const compactLength = text.replace(/\s/g, "").length;
      const values = extractSkuValues(text);

      for (const value of values) {
        skus.push(makeSku(value, "pdf-text", pageNumber));
      }

      if (compactLength < MIN_USABLE_TEXT_LENGTH) {
        ocrPages.push(pageNumber);
      } else if (!values.length) {
        warnings.push({
          code: "page-no-skus",
          page: pageNumber,
          message: `Page ${pageNumber} contained text but no matching item numbers.`,
        });
      }
      page.cleanup();
    }

    let usedOcr = false;
    if (ocrPages.length) {
      usedOcr = true;
      const ocrResult = await recognizePages(pdf, ocrPages, onProgress);
      skus.push(...ocrResult.skus);
      warnings.push(...ocrResult.warnings);
    }

    const sorted = dedupeAndSortSkus(skus);
    if (!sorted.length) {
      throw new PullListError(
        "no-skus",
        "No item numbers matched the expected format (for example, 9127-66 or BES-220).",
      );
    }

    emit(onProgress, "done", 100, `Found ${sorted.length} unique item numbers.`);
    return {
      fileName: file.name,
      pageCount: pdf.numPages,
      usedOcr,
      skus: sorted,
      warnings,
      elapsedMs: performance.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof PullListError) throw error;
    const name = error instanceof Error ? error.name : "";
    const message = error instanceof Error ? error.message : "";
    if (/password/i.test(name) || /password|encrypted/i.test(message)) {
      throw new PullListError(
        "encrypted",
        "That PDF is password-protected. Export an unlocked copy from ShipStation and try again.",
      );
    }
    throw new PullListError(
      "unreadable",
      "That PDF could not be read. Export a fresh Product Pick List from ShipStation and try again.",
    );
  } finally {
    pdf?.cleanup();
    await loadingTask?.destroy();
  }
}
