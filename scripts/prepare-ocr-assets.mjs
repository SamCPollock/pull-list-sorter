import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "public", "tesseract");
const coreOutput = join(output, "core");
const langOutput = join(output, "lang");

async function firstExisting(paths) {
  for (const path of paths) {
    try {
      if ((await stat(path)).isFile()) return path;
    } catch {
      // Try the next known package layout.
    }
  }
  throw new Error(`OCR asset not found. Checked:\n${paths.join("\n")}`);
}

await rm(output, { recursive: true, force: true });
await mkdir(coreOutput, { recursive: true });
await mkdir(langOutput, { recursive: true });

await cp(
  join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"),
  join(output, "worker.min.js"),
);

const coreRoot = join(root, "node_modules", "tesseract.js-core");
for (const entry of await readdir(coreRoot, { withFileTypes: true })) {
  if (entry.isFile() && /^tesseract-core(?:-(?:relaxedsimd|simd))?-lstm\.wasm\.js$/.test(entry.name)) {
    await cp(join(coreRoot, entry.name), join(coreOutput, entry.name));
  }
}

const languageSource = await firstExisting([
  join(root, "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"),
  join(root, "node_modules", "@tesseract.js-data", "eng", "4.0.0", "eng.traineddata.gz"),
  join(root, "node_modules", "@tesseract.js-data", "eng", "eng.traineddata.gz"),
]);
await cp(languageSource, join(langOutput, "eng.traineddata.gz"));

console.log("Prepared self-hosted OCR worker, core, and English language assets.");
