"""Fetch checksum-pinned M0 inputs and inventory the complete quartet and the 42-bar extract."""
from collections import Counter
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
from xml.etree import ElementTree as ET
from zipfile import ZipFile
import json

OUT = Path("build/importer-m0")
MANIFEST = Path(__file__).with_name("fixtures.json")


def prepare(entry):
    """Keep downloads out of Git and refuse drift even when a file was previously cached."""
    local = entry["source"].startswith("repository at")
    path = Path(entry["file"]) if local else OUT / entry["file"]
    data = path.read_bytes() if path.exists() else urlopen(entry["source"], timeout=30).read()
    if sha256(data).hexdigest() != entry["sha256"]:
        raise ValueError(f"Fixture changed: {path}")
    if not local and not path.exists():
        path.write_bytes(data)


def counts(root):
    """Count attacks/rests once per onset in each voice, excluding grace and chord members."""
    notes = root.findall("./part/measure/note")
    tags = Counter(e.tag for e in root.iter())
    return dict(parts=len(root.findall("part")), bars=[len(p.findall("measure")) for p in root.findall("part")],
                timed=sum(n.find("grace") is None and n.find("chord") is None for n in notes),
                tags={k: tags[k] for k in ("note", "rest", "chord", "grace", "backup", "forward", "tie", "slur", "direction", "tuplet")})


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for fixture in json.loads(MANIFEST.read_text()):
        prepare(fixture)
    with ZipFile(BytesIO((OUT / "haydn.mxl").read_bytes())) as archive:
        container = ET.fromstring(archive.read("META-INF/container.xml"))
        rootfile = container.find(".//{*}rootfile").get("full-path")
        xml = archive.read(rootfile)
    (OUT / "full.musicxml").write_bytes(xml)
    root = ET.fromstring(xml)
    inventory = {"full": counts(root)}
    # Same written selection as issues/197/check-edition.py. Retain all voices for the reader timing.
    for part in root.findall("part"):
        bars = part.findall("measure")
        for measure in bars[:128] + bars[170:]:
            part.remove(measure)
    excerpt = ET.tostring(root, encoding="utf-8")
    (OUT / "excerpt.musicxml").write_bytes(excerpt)
    inventory["excerpt"] = counts(root)
    for key, data in (("full", xml), ("excerpt", excerpt)):
        inventory[key].update(bytes=len(data), sha256=sha256(data).hexdigest())
    assert inventory["full"]["timed"] == 10014
    assert inventory["excerpt"]["bars"] == [42] * 4
    print(json.dumps(inventory, indent=2))
