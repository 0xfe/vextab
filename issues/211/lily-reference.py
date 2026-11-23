"""Rebuild independent MIDI reference rows for the two licensed LilyPond excerpts."""
from collections import defaultdict, deque
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import urlopen
import argparse
import os
import subprocess

import mido

HERE = Path(__file__).resolve().parent / "fixtures"
MIDI_URL = "https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.mid"
MIDI_SHA = "3dd712a85fabd267f5a2cee5cb23af4683408c2f29b8814721844498f1ee4f66"


def observations(path, limit):
    """Keep multiplicity and whole-note ticks. A held pitch ending at the cut belongs to the excerpt."""
    midi = mido.MidiFile(path)
    whole = 4 * midi.ticks_per_beat
    rows = []
    for track in midi.tracks:
        time = 0
        held = defaultdict(deque)
        for msg in track:
            time += msg.time
            if time * 8 > limit * whole:
                break
            if msg.type == "note_on" and msg.velocity:
                held[msg.channel, msg.note].append(time)
            elif msg.type == "note_off" or msg.type == "note_on" and not msg.velocity:
                start = held[msg.channel, msg.note].popleft()
                assert 1536 * start % whole == 0 and 1536 * time % whole == 0
                rows.append((1536 * start // whole, msg.note, 1536 * time // whole))
    return rows


def save(name, rows):
    (HERE / (name + ".tsv")).write_text("".join("%s\t%s\t%s\n" % row for row in sorted(rows)))


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--maple-midi", type=Path, help="Use a locally cached copy of the published MIDI.")
    options = parser.parse_args()
    version = subprocess.check_output(["lilypond", "--version"], text=True)
    assert version.startswith("GNU LilyPond 2.26.0 ")
    with TemporaryDirectory() as scratch:
        work = Path(scratch)
        raw = options.maple_midi.read_bytes() if options.maple_midi else urlopen(MIDI_URL, timeout=30).read()
        assert sha256(raw).hexdigest() == MIDI_SHA
        (work / "joplin.mid").write_bytes(raw)
        joplin = observations(work / "joplin.mid", 129)
        assert len(joplin) == 552
        save("joplin-first", joplin)
        definitions = (HERE / "sor-opening.ly").read_text().split(r"\score")[0]
        env = dict(os.environ, XDG_CACHE_HOME=scratch)
        # Channeling each voice separately preserves simultaneous unisons and independent releases.
        for voice in ("upperVoice", "lowerVoice", "middleVoice"):
            source = work / (voice + ".ly")
            source.write_text(definitions + r'\score { \new Staff { \time 3/4 ' + "\\" + voice + r' } \midi {} }')
            subprocess.run(["convert-ly", "--edit", source], check=True, cwd=work, capture_output=True, env=env)
            subprocess.run(["lilypond", "-dno-print-pages", source], check=True, cwd=work, capture_output=True, env=env)
            save("sor-" + voice, observations(work / (voice + ".midi"), 48))


if __name__ == "__main__":
    main()

