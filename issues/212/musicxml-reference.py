"""Independent score observations for complete historical MusicXML and published recordings."""
from collections import defaultdict
from fractions import Fraction
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
from xml.etree import ElementTree as ET
from zipfile import ZipFile
import argparse
import json
import re

HERE = Path(__file__).resolve().parent / "musicxml"
CACHE = HERE.parents[2] / "build" / "importer-m5" / "musicxml"
# Every one of these documents is consumed unaltered, including the archive metadata.
SOURCES = {
    "bwv269.mxl": ("https://raw.githubusercontent.com/cuthbertLab/music21/40e95ae567fe8b8e35317447dc74d5cdbb2fb83d/music21/corpus/bach/bwv269.mxl", "9676f11a2b26488bcf30db90c15576caa1ea2a616b909e376d44b8b804e9d138"),
    "chor001.krn": ("https://raw.githubusercontent.com/craigsapp/bach-370-chorales/a95574f9e93b4d72a96cd390a059df4f8471ddb6/kern/chor001.krn", "76eb7432a97d2a817128517dc9adb4dfeccf7a87d234d9b29a82c7cc46e51f49"),
    "Dichterliebe01.mxl": ("https://wpmedia.musicxml.com/wp-content/uploads/2021/06/Dichterliebe01.mxl", "88e72a9893cd448d59925cd9a95831baebb27b611cfd7b3b2bedb3ca28582f07"),
}


def upstream(name):
    """Keep upstream scores out of redistributions unless the releaser gave a clear permission."""
    url, digest = SOURCES[name]
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    data = path.read_bytes() if path.exists() else urlopen(url, timeout=30).read()
    assert sha256(data).hexdigest() == digest, name
    if not path.exists():
        path.write_bytes(data)
    return data


def ticks(value):
    """Both editions use durations exactly representable at 384 ticks per quarter note."""
    value = Fraction(value) * 1536
    assert value.denominator == 1
    return value.numerator


def written(root):
    """Read these monophonic part spines directly with ElementTree, preserving every explicit rest and syllable."""
    result = []
    for part in root.findall("part"):
        rows = []
        spans = []
        div = None
        for bar, measure in enumerate(part.findall("measure"), 1):
            div = int(measure.findtext("attributes/divisions", div))
            start = Fraction(0)
            assert measure.find("backup") is None and measure.find("forward") is None
            for n in measure.findall("note"):
                assert n.find("chord") is None and n.find("grace") is None
                duration = Fraction(int(n.findtext("duration")), 4 * div)
                p = n.find("pitch")
                spelling = None if p is None else p.findtext("step") + {-1: "b", 0: "", 1: "#"}[int(p.findtext("alter", 0))] + p.findtext("octave")
                lyrics = [lyric.text for lyric in n.findall("lyric/text") if lyric.text and lyric.text.strip()]
                rows.append([bar, ticks(start), ticks(duration), spelling, lyrics])
                start += duration
            spans.append(ticks(start))
        result.append({"rows": rows, "bars": spans})
    return result


def chorale_performance(score):
    """Perform the XML edition's actual backward repeat and pair its explicit playing ties."""
    result = []
    for part in score.findall("part"):
        measures = part.findall("measure")
        ends = [i for i, m in enumerate(measures) if m.find('barline/repeat[@direction="backward"]') is not None]
        assert ends == [7]
        order = measures[:ends[0]+1] + measures
        held = {}
        rows = []
        clock = 0
        divisions = int(measures[0].findtext("attributes/divisions"))
        for m in order:
            for n in m.findall("note"):
                pitch = 12 * (1 + int(n.findtext("pitch/octave"))) + "C D EF G A B".index(n.findtext("pitch/step")) + int(n.findtext("pitch/alter", 0))
                duration = ticks(Fraction(int(n.findtext("duration")), 4 * divisions))
                edges = {edge.get("type") for edge in n.findall("tie")}
                if "stop" in edges:
                    row = held.pop(pitch)
                    assert row[2] == clock
                    row[2] += duration
                else:
                    row = [clock, pitch, clock + duration]
                    rows.append(row)
                if "start" in edges:
                    held[pitch] = row
                clock += duration
        assert not held
        result.append(rows)
    return result


def kern_performance(data):
    """Unfold the printed A,A,B form and join explicit ties on each of the four Humdrum spines."""
    lines = data.decode().splitlines()
    sections = defaultdict(list)
    form = None
    current = None
    for line in lines:
        if line.startswith("*>["):
            form = line.split("\t")[0][3:-1].split(",")
        if line.startswith(("*>A\t", "*>B\t")):
            current = line[2]
        if current and line and line[0] not in "!*=":
            sections[current].append(line.split("\t"))
    assert form == ["A", "A", "B"]
    performance = []
    for spine in reversed(range(4)):  # Humdrum orders these spines bass to soprano.
        clock = 0
        rows = []
        for section in form:
            for fields in sections[section]:
                value = fields[spine]
                if value == ".":
                    continue
                match = re.search(r"(\d+)(\.*)([A-Ga-g]+)([#-]*)", value)
                assert match, value
                denom, dots, letters, acc = match.groups()
                duration = ticks(Fraction(1, int(denom)) * sum(Fraction(1, 2**i) for i in range(1 + len(dots))))
                octave = 3 + len(letters) if letters.islower() else 4 - len(letters)
                pitch = 12 * (1 + octave) + "C D EF G A B".index(letters[0].upper()) + acc.count("#") - acc.count("-")
                if "]" in value or "_" in value:
                    assert rows[-1][1:] == [pitch, clock]
                    rows[-1][2] += duration
                else:
                    rows.append([clock, pitch, clock + duration])
                clock += duration
        performance.append(rows)
    return performance


def regenerate_midi():
    """Regenerate the offline tuples with the independent Standard MIDI File reader mido 1.3.3."""
    import mido
    path = HERE / "Echigo-Jishi.mid"
    assert sha256(path.read_bytes()).hexdigest() == "22a42c352b411a072f45d1b5a03f289ba67f2635a58c7fa2aaac13168812e1ef"
    midi = mido.MidiFile(path)
    assert midi.ticks_per_beat == 384
    notes = []
    for track in midi.tracks:
        clock = 0
        held = {}
        for msg in track:
            clock += msg.time
            if msg.type == "note_on" and msg.velocity:
                assert (msg.channel, msg.note) not in held
                held[msg.channel, msg.note] = clock
            elif msg.type == "note_off" or msg.type == "note_on" and not msg.velocity:
                notes.append((held.pop((msg.channel, msg.note)), msg.note, clock))
        assert not held
    (HERE / "Echigo-Jishi.tsv").write_text("".join("%s\t%s\t%s\n" % row for row in sorted(notes)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--midi", action="store_true", help="Regenerate committed MIDI tuples.")
    parser.add_argument("--held-out", action="store_true", help="Fetch and verify the Bach and Schumann sources.")
    options = parser.parse_args()
    if options.midi:
        regenerate_midi()
    else:
        archive = (HERE / "Echigo-Jishi.mxl").read_bytes()
        assert sha256(archive).hexdigest() == "e22c3d5181cab2897ebeb8bde8baafe03ff207f939a5a3a520eabc958f50f575"
        source = ZipFile(BytesIO(archive)).read("Echigo-Jishi.musicxml")
        # This is also the checksum of the publisher's separately distributed plain XML file.
        assert sha256(source).hexdigest() == "2eda7f04e115f6923c312377900a8a7923115a965b6ce82958afceccfa9d8008"
        result = {"Echigo-Jishi": {"written": written(ET.fromstring(source)), "performance": [[list(map(int, line.split())) for line in (HERE / "Echigo-Jishi.tsv").read_text().splitlines()]]}}
        if options.held_out:
            bach = ZipFile(BytesIO(upstream("bwv269.mxl"))).read("bwv269.xml")
            result["bwv269"] = {"written": written(ET.fromstring(bach)), "performance": chorale_performance(ET.fromstring(bach)), "crossEdition": kern_performance(upstream("chor001.krn"))}
            upstream("Dichterliebe01.mxl")
        print(json.dumps(result, ensure_ascii=False))
