"""Fetch the exact upstream exporter files and verify cached copies before use."""
from pathlib import Path
from hashlib import sha256
from urllib.request import urlopen
import json

out = Path("build/importer-m3")
out.mkdir(parents=True, exist_ok=True)
for item in json.loads(Path(__file__).with_name("exporters.json").read_text()):
    path = out / item["file"]
    data = path.read_bytes() if path.exists() else urlopen(item["url"], timeout=30).read()
    if sha256(data).hexdigest() != item["sha256"]:
        raise ValueError(f"Unexpected fixture contents: {path}")
    if not path.exists():
        path.write_bytes(data)
    print(path)
