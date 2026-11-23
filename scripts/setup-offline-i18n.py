"""Download public Argos models locally. No account, key or inference API.

Models and runtime stay in ignored tmp/offline-i18n; only reviewed translation
JSON files are eligible for website builds. Model binaries use MIT/CC0:
https://github.com/argosopentech/argos-translate/issues/533
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tmp/offline-i18n"
MODEL_CODES = {"hi": "hi", "ar": "ar", "fr": "fr", "es": "es", "de": "de",
               "zh-CN": "zh", "zh-TW": "zt", "ja": "ja", "pt": "pb", "ru": "ru"}
INDEX_URL = "https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json"


def download(url, destination):
    if not url.startswith("https://"):
        raise ValueError("HTTPS model downloads only")
    temporary = destination.with_suffix(destination.suffix + ".partial")
    # Use the platform's HTTPS client where available; it uses the system TLS
    # configuration. This downloads public files, never an inference endpoint.
    curl = shutil.which("curl.exe") or shutil.which("curl")
    if curl:
        subprocess.run([curl, "--fail", "--location", "--silent", "--show-error", "--max-time", "600",
                        "--max-filesize", str(600 * 1024 * 1024), "--output", str(temporary), url], check=True)
        temporary.replace(destination)
        return
    with urllib.request.urlopen(url, timeout=60) as response, temporary.open("wb") as output:
        copied = 0
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
            copied += len(chunk)
            if copied > 600 * 1024 * 1024:
                raise ValueError("Model archive exceeds size limit")
    temporary.replace(destination)


def install_model(package, language):
    url = next(link for link in package["links"] if link.startswith("https://argos-net.com/"))
    name = url.rsplit("/", 1)[1]
    archive = WORK / "downloads" / name
    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        print(f"Downloading {language}: {url}", flush=True)
        download(url, archive)
    directory = WORK / "models" / archive.stem
    directory.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as packed:
        if sum(member.file_size for member in packed.infolist()) > 1500 * 1024 * 1024:
            raise ValueError("Unpacked model exceeds size limit")
        for member in packed.infolist():
            target = (directory / member.filename).resolve()
            if not target.is_relative_to(directory.resolve()):
                raise ValueError("Unsafe path in model archive")
            # Preserve package metadata, model weights, tokenizer and licensing.
            # Stanza models are unused; no code from the archive is executed.
            if "/stanza/" in "/" + member.filename or member.is_dir():
                continue
            if member.filename.endswith((".py", ".pyc", ".exe", ".dll", ".pth")):
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with packed.open(member) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
    model = next(directory.rglob("model.bin")).parent
    tokenizer = next(directory.rglob("sentencepiece.model"), None) or next(directory.rglob("bpe.model"), None)
    if not tokenizer:
        raise ValueError("No supported tokenizer in model")
    with archive.open("rb") as binary:
        archive_hash = hashlib.file_digest(binary, "sha256").hexdigest()
    return {"language": language, "modelCode": package["to_code"], "fromCode": package["from_code"], "toCode": package["to_code"], "version": package["package_version"],
            "tokenizerKind": "bpe" if tokenizer.name == "bpe.model" else "sentencepiece",
            "url": url, "archiveSha256": archive_hash,
            "modelDirectory": model.relative_to(ROOT).as_posix(), "tokenizer": tokenizer.relative_to(ROOT).as_posix(),
            "license": "MIT/CC0; preserve additional package README notices (including OPUS CC-BY-4.0 where specified)",
            "licenseSource": "https://github.com/argosopentech/argos-translate/issues/533"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--languages", default=",".join(MODEL_CODES))
    parser.add_argument("--download", action="store_true", help="Download public model files; no inference request")
    parser.add_argument("--reverse", action="store_true", help="Install local target-to-English QA models separately")
    options = parser.parse_args()
    selected = options.languages.split(",")
    if not selected or len(set(selected)) != len(selected) or any(code not in MODEL_CODES for code in selected):
        parser.error("Choose supported, unique language codes")
    WORK.mkdir(parents=True, exist_ok=True)
    manifest = WORK / ("reverse-models.json" if options.reverse else "models.json")
    installed = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else {}
    if not options.download:
        print(json.dumps({"selected": selected, "installed": list(installed), "downloadRequested": False}, indent=2))
        return
    index_file = WORK / "package-index.json"
    if not index_file.exists():
        download(INDEX_URL, index_file)
    packages = json.loads(index_file.read_text(encoding="utf-8"))
    for language in selected:
        if language in installed and (ROOT / installed[language]["modelDirectory"] / "model.bin").is_file():
            print(f"Reusing installed {language}", flush=True)
            continue
        from_code, to_code = (MODEL_CODES[language], "en") if options.reverse else ("en", MODEL_CODES[language])
        package = next(item for item in packages if item["from_code"] == from_code and item["to_code"] == to_code)
        installed[language] = install_model(package, language)
        temporary = manifest.with_suffix(".writing")
        temporary.write_text(json.dumps(installed, indent=2) + "\n", encoding="utf-8")
        temporary.replace(manifest)
        print(f"Installed {language} {package['package_version']}", flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
