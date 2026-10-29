export type SkuSource = "pdf-text" | "ocr" | "manual";

export interface ExtractedSku {
  id: string;
  value: string;
  source: SkuSource;
  page?: number;
  confidence?: number;
}

export type WarningCode = "ocr-used" | "page-no-skus" | "ocr-no-skus";

export interface ExtractionWarning {
  code: WarningCode;
  message: string;
  page?: number;
}

export interface ExtractionResult {
  fileName: string;
  pageCount: number;
  usedOcr: boolean;
  skus: ExtractedSku[];
  warnings: ExtractionWarning[];
  elapsedMs: number;
}

export type ProgressPhase = "reading" | "text" | "loading-ocr" | "ocr" | "done";

export interface ExtractionProgress {
  phase: ProgressPhase;
  percent: number;
  message: string;
}
