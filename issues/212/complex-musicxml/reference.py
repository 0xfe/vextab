"""Fetch checksum-pinned scores and observe their written clocks independently of VexTab."""
from fractions import Fraction
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
from xml.etree import ElementTree as ET
from zipfile import ZipFile
import argparse
import json

HERE = Path(__file__).resolve().parent
OUTPUT = HERE.parents[2] / "build" / "importer-complex-musicxml"
ALTER = {-2: "bb", -1: "b", 0: "", 1: "#", 2: "##"}


def read_score(record, offline):
    """Verify the exact archive and the decoded score member before either reader observes it."""
    path = OUTPUT / record["file"]
    if not path.exists() and offline:
        raise FileNotFoundError(f"Missing {path}. Run once without --offline to fetch the scores.")
    raw = path.read_bytes() if path.exists() else urlopen(record["url"], timeout=45).read()
    if sha256(raw).hexdigest() != record["archiveSHA256"]:
        raise ValueError(f"Archive differs from the pinned source: {record['file']}")
    if not path.exists():
        path.write_bytes(raw)
    with ZipFile(BytesIO(raw)) as archive:
        container = ET.fromstring(archive.read("META-INF/container.xml"))
        member = next(e.get("full-path") for e in container.iter() if e.tag.split("}")[-1] == "rootfile")
        xml = archive.read(member)
    assert sha256(xml).hexdigest() == record["xmlSHA256"]
    path.with_suffix(".musicxml").write_bytes(xml)
    return ET.fromstring(xml)


def fraction(value):
    """Use an exact whole-note fraction, including its denominator when the value is integral."""
    return f"{value.numerator}/{value.denominator}"


def observe_part(part):
    """Read one document cursor, preserving voice and displayed staff across backups and chord members."""
    divisions = None
    transpose = 0
    bars = []
    written = []
    for ordinal, measure in enumerate(part.findall("measure"), 1):
        cursor = extent = Fraction(0)
        chord_onset = None
        sounding = []
        for child in measure:
            if child.tag == "attributes":
                divisions = int(child.findtext("divisions", divisions))
                change = child.find("transpose")
                if change is not None:
                    transpose = int(change.findtext("chromatic", 0)) + 12 * int(change.findtext("octave-change", 0))
            if child.tag not in ("backup", "forward", "note") or child.find("grace") is not None:
                continue
            duration = Fraction(int(child.findtext("duration")), 4 * divisions)
            if child.tag == "backup":
                cursor -= duration
            elif child.tag == "forward":
                cursor += duration
            else:
                if child.find("chord") is None:
                    chord_onset = cursor
                    cursor += duration
                assert chord_onset is not None
                if child.get("print-object") == "no":
                    extent = max(extent, cursor, chord_onset + duration)
                    continue
                staff = int(child.findtext("staff", 1))
                voice = child.findtext("voice", "1")
                pitch = child.find("pitch")
                spelling = "rest"
                if pitch is not None:
                    step = pitch.findtext("step")
                    alter = int(pitch.findtext("alter", 0))
                    octave = int(pitch.findtext("octave"))
                    spelling = step + ALTER[alter] + str(octave)
                    midi = 12 * (octave + 1) + "C D EF G A B".index(step) + alter + transpose
                    edges = {tie.get("type") for tie in child.findall("tie")}
                    sounding.append((chord_onset, duration, staff, voice, midi, edges))
                written.append([part.get("id"), staff, voice, ordinal, fraction(chord_onset), fraction(duration), spelling])
                extent = max(extent, chord_onset + duration)
            assert cursor >= 0
            extent = max(extent, cursor)
        repeats = [r.get("direction") for r in measure.findall("barline/repeat")]
        bars.append((extent, sounding, repeats))
    return bars, written


def perform(bars):
    """Play these scores' simple backward repeats and join sounding ties before comparing MIDI notes."""
    visits = []
    start = 0
    for i, (_, _, repeats) in enumerate(bars):
        if "forward" in repeats:
            start = i
        visits.append(i)
        if "backward" in repeats:
            visits.extend(range(start, i + 1))
    clock = Fraction(0)
    sounding = []
    held = {}
    for index in visits:
        extent, notes, _ = bars[index]
        for onset, duration, staff, voice, midi, edges in sorted(notes, key=lambda note: note[0]):
            key = (staff, voice, midi)
            at = clock + onset
            if "stop" in edges:
                candidates = [k for k, note in held.items() if k[0] == staff and k[2] == midi and note[2] == at]
                if key in candidates:
                    source = key
                else:
                    # The left hand in Gretchen transfers several tied heads between voice IDs.
                    assert len(candidates) == 1, (key, at, candidates)
                    source = candidates[0]
                note = held.pop(source)
                note[2] += duration
            else:
                note = [at, midi, at + duration]
                sounding.append(note)
            if "start" in edges:
                assert key not in held
                held[key] = note
        clock += extent
    assert not held

    def ticks(value):
        scaled = value * 1536
        assert scaled.denominator == 1
        return scaled.numerator

    return [i + 1 for i in visits], [[ticks(start), midi, ticks(end)] for start, midi, end in sounding]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    options = parser.parse_args()
    OUTPUT.mkdir(exist_ok=True, parents=True)
    for record in json.loads((HERE / "sources.json").read_text()):
        root = read_score(record, options.offline)
        parts = root.findall("part")
        assert len(parts) == record["parts"]
        assert all(len(p.findall("measure")) == record["bars"] for p in parts)
        assert len(root.findall("part/measure/note")) == record["rawNotes"]
        if record["status"] == "failed":
            continue
        written = []
        played = {}
        for part in parts:
            bars, rows = observe_part(part)
            written.extend(rows)
            if record.get("verifyPerformedTuples"):
                assert not part.findall(".//grace") and not part.findall(".//ornaments/*")
                visits, notes = perform(bars)
                played[part.get("id")] = {"visits": visits, "notes": notes}
        result = {"written": written, "played": played}
        if played:
            tempos = {s.get("tempo") for s in root.findall(".//sound") if s.get("tempo")}
            assert len(tempos) == 1
            result["quarterBPM"] = int(tempos.pop())
        (OUTPUT / (record["file"] + ".reference.json")).write_text(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
