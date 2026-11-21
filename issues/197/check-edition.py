"""Compare the printed quartet's principal notes and rests with the pinned OpenScore edition."""

from fractions import Fraction
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import subprocess
import sys
from urllib.request import urlopen
from xml.etree import ElementTree
from zipfile import ZipFile

# OpenScore CC0 catalogue entry 20428156. The archive includes all four movements.
EDITION = (
    "https://raw.githubusercontent.com/OpenScore/StringQuartets/"
    "2614b0b2958dd1ce3f52e172a43e5f4d0e29570f/scores/Haydn,_Joseph/"
    "String_Quartet_in_C_major,_Hob.III77,_Op.76_No.3/sq20428156.mxl"
)
DIGEST = "3bd97417c8e7a5b80fba5821ec4d80d8bde19f030f169ac3cfba17f3a70492dd"
SOURCE = "guide/scores/haydn-emperor-theme.vextab"


def edition_bars(part):
    """Take the pickup and twenty numbered bars preceding Variation I."""
    measures = part.findall("measure")[128:149]
    assert [bar.get("number") for bar in measures] == list(map(str, range(21)))
    ticks_per_whole = 4 * int(measures[0].findtext("attributes/divisions"))
    for measure in measures:
        attacks = []
        for note in measure.findall("note"):
            # The auxiliary invisible voice anchors turns. Unmeasured ornament notes have no duration.
            if note.findtext("voice") != "1" or note.find("grace") is not None:
                continue
            if note.find("chord") is None:
                attacks.append((Fraction(int(note.findtext("duration")), ticks_per_whole), []))
            if note.find("pitch") is not None:
                accidental = {-1: "b", 0: "", 1: "#"}[int(note.findtext("pitch/alter", "0"))]
                attacks[-1][1].append(note.findtext("pitch/step") + accidental + note.findtext("pitch/octave"))
        yield attacks


def main():
    """Check each attack in score order and report the first differing instrument and written measure."""
    archive = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else urlopen(EDITION, timeout=30).read()
    if sha256(archive).hexdigest() != DIGEST:
        raise ValueError("The archive differs from the pinned OpenScore edition")
    edition = ElementTree.fromstring(ZipFile(BytesIO(archive)).read("score.xml"))
    compiler = """
        const { parseScore } = require('./dist/score.cjs');
        console.log(JSON.stringify(parseScore(require('node:fs').readFileSync(process.argv[1], 'utf8'))));
    """
    score = json.loads(subprocess.check_output(["node", "-e", compiler, SOURCE], text=True))
    parts = edition.findall("part")
    assert len(parts) == len(score["parts"]) == 4
    for original, instrument in zip(parts, score["parts"]):
        voice = instrument["staves"][0]["voices"][0]
        assert len(voice["measures"]) == 21
        for bar, expected in enumerate(edition_bars(original)):
            m = voice["measures"][bar]
            actual = [(Fraction(e["duration"]), [h["pitch"] for h in e["heads"]])
                      for e in voice["events"][m["start"]:m["end"]]]
            if actual != expected:
                raise ValueError(f"{instrument['name']}, written bar {bar}: {actual} differs from {expected}")
        print(instrument["name"], len(voice["events"]), "attacks and rests match")


if __name__ == "__main__":
    main()
