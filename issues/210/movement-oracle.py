"""Observe the complete second movement directly from the checksum-pinned OpenScore source."""
from fractions import Fraction
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile
import json

archive = Path(__file__).with_name("fixtures") / "haydn.mxl"
data = archive.read_bytes()
assert sha256(data).hexdigest() == "3bd97417c8e7a5b80fba5821ec4d80d8bde19f030f169ac3cfba17f3a70492dd"
with ZipFile(BytesIO(data)) as zipfile:
    score = ET.fromstring(zipfile.read("score.xml"))
assert score.findtext(".//software") == "MuseScore Studio 4.7.4"

def rational(value):
    """Use the exact fraction spelling emitted by the public parser."""
    return f"{value.numerator}/{value.denominator}"

def source_rows(part):
    """Track each cursor move once and append continuing chord heads to the primary attack."""
    rows = {}
    divisions = None
    for ordinal, bar in enumerate(part.findall("measure"), 1):
        if ordinal > 237:
            break
        cursor = Fraction(0)
        prior = None
        for child in bar:
            if child.tag == "attributes" and child.findtext("divisions"):
                divisions = int(child.findtext("divisions"))
            if ordinal < 129 or child.tag not in ("note", "backup", "forward") or child.find("grace") is not None:
                continue
            elapsed = Fraction(int(child.findtext("duration")), 4 * divisions)
            if child.tag == "backup":
                cursor -= elapsed
            elif child.tag == "forward":
                cursor += elapsed
            else:
                voice = child.findtext("voice", "1")
                if child.find("chord") is None:
                    prior = [ordinal - 128, rational(cursor), rational(elapsed), []]
                    if child.get("print-object") != "no":
                        rows.setdefault(voice, []).append(prior)
                    cursor += elapsed
                pitch = child.find("pitch")
                if pitch is not None:
                    alter = int(pitch.findtext("alter", "0"))
                    prior[3].append(pitch.findtext("step") + {-1:"b",0:"",1:"#"}[alter] + pitch.findtext("octave"))
    return rows

print(json.dumps([source_rows(part) for part in score.findall("part")]))
