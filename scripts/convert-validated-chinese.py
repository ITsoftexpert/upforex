"""Local OpenCC conversion, with a fingerprint of the installed dictionaries."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys
import opencc

sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
root = Path(opencc.__file__).parent
fingerprint = hashlib.sha256()
for file in sorted(root.rglob("*")):
    if file.is_file() and file.suffix in (".json", ".txt"):
        fingerprint.update(file.relative_to(root).as_posix().encode("utf-8"))
        fingerprint.update(file.read_bytes())
converter = opencc.OpenCC("s2t")
values = json.load(sys.stdin)
json.dump({"conversion": {"engine": "opencc-python-reimplemented",
    "version": importlib.metadata.version("opencc-python-reimplemented"),
    "config": "s2t", "dictionarySha256": fingerprint.hexdigest()},
    "targets": {key: converter.convert(value) for key, value in values.items()}}, sys.stdout, ensure_ascii=False)
