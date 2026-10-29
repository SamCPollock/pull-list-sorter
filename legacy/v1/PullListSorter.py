import subprocess
import sys
import importlib.util
import os
import platform
from datetime import datetime

# === Step 1: Install Python packages silently ===
def install_python_packages(packages):
    for package in packages:
        if importlib.util.find_spec(package) is None:
            print(f"📦 Installing: {package}...")
            subprocess.run(
                [sys.executable, "-m", "pip", "install", package],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )

install_python_packages(["pytesseract", "pdf2image", "pillow", "pandas"])

# === Step 2: macOS — check/install Homebrew quietly ===
def install_homebrew_if_missing():
    try:
        subprocess.run(["brew", "--version"],
                       stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        print("🍺 Homebrew not found.")
        input("🔐 Please install Homebrew manually from https://brew.sh, then press Enter to continue...")
        sys.exit(1)

# === Step 3: Install system tools quietly ===
def install_system_packages():
    system = platform.system()
    try:
        if system == "Linux":
            subprocess.run(["sudo", "apt", "update"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(["sudo", "apt", "install", "-y", "tesseract-ocr", "poppler-utils"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif system == "Darwin":
            install_homebrew_if_missing()
            subprocess.run(["brew", "install", "tesseract"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(["brew", "install", "poppler"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        print(f"⚠️ Silent system install failed: {e}")
        sys.exit(1)

install_system_packages()

# === Step 4: Imports (after install) ===
from pdf2image import convert_from_path
import pytesseract
import pandas as pd
import re

# === Step 5: OCR pull list ===
PDF_FILE = "pull_list.pdf"
if not os.path.exists(PDF_FILE):
    print(f"❌ File '{PDF_FILE}' not found.")
    sys.exit(1)

print("📄 Converting PDF to images...")
pages = convert_from_path(PDF_FILE, dpi=300)

print("🧠 Running OCR...")
full_text = ""
for page in pages:
    full_text += pytesseract.image_to_string(page)

print("🔍 Extracting Item #s...")
pattern = re.compile(r"\b[\w]{2,5}-\d{2,3}\b")
item_numbers = sorted(set(pattern.findall(full_text)))

if not item_numbers:
    print("⚠️ No Item #s found.")
    sys.exit(1)

# === Step 6: Save CSV ===
date_str = datetime.today().strftime("%Y-%m-%d")
output_filename = f"{date_str}_item_numbers_only.csv"
df = pd.DataFrame({"Item #": item_numbers})
df.to_csv(output_filename, index=False)
print(f"📁 Saved: {output_filename}")

# === Step 7: Ask before printing ===
should_print = input("🖨️ Do you want to print the sorted list? (y/n): ").strip().lower()
if should_print == 'y':
    system = platform.system()
    try:
        if system == "Darwin":
            subprocess.run(["lp", output_filename],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print("✅ Sent to printer via 'lp'.")
        elif system == "Linux":
            subprocess.run(["lpr", output_filename],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print("✅ Sent to printer via 'lpr'.")
        else:
            print("⚠️ Auto-printing not supported on this OS.")
    except Exception as e:
        print(f"⚠️ Print error: {e}")
else:
    print("🛑 Skipped printing.")

# Optional: keep Automator open for feedback
input("✅ Done! Press Enter to close...")
