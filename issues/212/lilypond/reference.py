"""Regenerate whole-edition written and performed observations with LilyPond 2.26.0."""
from collections import defaultdict, deque
from fractions import Fraction
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
import argparse
import os
import subprocess

import mido

HERE = Path(__file__).resolve().parent
EDITION = {
    "sor": ("a2dfb39a40b2dd8b406cce4894af20dcd5e5312e815825170e2fbec40c5ca217", ["upperVoice", "lowerVoice", "middleVoice"]),
    "bwv999": ("67c2ab0e9bcffeb07b7be0006a74264c8d65ea8c96868e1e205f9d76fb148fa1", ["melody", "bass"]),
    "maple": ("043e9d9207b771658a9afa51e2aa2537c448ecfd602e78ae50110cf3b12209fd", ["top", "bottom"]),
}


def notation(data):
    """Native event listener reports absolute notename, alteration and octave before string projection."""
    rows = []
    for line in data.splitlines():
        if not line.startswith("M5\t"):
            continue
        _, staff, onset, span, spelling = line.split("\t")
        # All three editions use binary note values.
        at, duration = Fraction(onset) * 1536, Fraction(span) * 1536
        assert at.denominator == duration.denominator == 1
        rows.append([int(at), int(duration), staff, spelling])
    return sorted(rows)


def performance(path):
    """Observe each MIDI channel independently and preserve overlapping attacks of the same pitch."""
    midi = mido.MidiFile(path)
    rows = []
    for track in midi.tracks:
        t = 0
        held = defaultdict(deque)
        for msg in track:
            t += msg.time
            if msg.type == "note_on" and msg.velocity:
                held[msg.channel, msg.note].append(t)
            elif msg.type == "note_off" or msg.type == "note_on" and not msg.velocity:
                on = held[msg.channel, msg.note].popleft()
                start, stop = Fraction(on * 384, midi.ticks_per_beat), Fraction(t * 384, midi.ticks_per_beat)
                assert start.denominator == stop.denominator == 1
                rows.append([int(start), msg.note, int(stop)])
        assert not any(held.values())
    return sorted(rows)


def run(cmd, cwd):
    done = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, env=dict(os.environ, XDG_CACHE_HOME=str(cwd)))
    if done.returncode:
        raise RuntimeError(done.stderr)
    return done.stdout


def source_for(name, voice, unfold):
    variable = ("\\" + voice)
    if unfold:
        variable = r"\unfoldRepeats " + variable
    if name != "maple":
        return r'\new Staff = "solo" { ' + (r"\time 3/4 " if name == "sor" else "") + variable + " }"
    # A voice crossing staves must find its destination, even when its partner is observed separately.
    up = variable if voice == "top" else "s1*80"
    down = variable if voice == "bottom" else "s1*80"
    return r'\new PianoStaff << \new Staff = "up" { ' + up + r' } \new Staff = "down" { ' + down + " } >>"


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--write", action="store_true", help="Replace checked-in native observations.")
    parser.add_argument("--published-maple-midi", type=Path, help="Also check the full independently published Mutopia MIDI.")
    args = parser.parse_args()
    assert subprocess.check_output(["lilypond", "--version"], text=True).startswith("GNU LilyPond 2.26.0 ")
    for name, (digest, voices) in EDITION.items():
        raw = (HERE / (name + ".ly")).read_bytes()
        assert sha256(raw).hexdigest() == digest
        with TemporaryDirectory() as temp:
            cwd = Path(temp)
            source = cwd / "edition.ly"
            source.write_bytes(raw)
            run(["convert-ly", "--edit", str(source)], cwd)
            definitions = source.read_text().split(r"\score {")[0]
            rows = []
            for voice in voices:
                layout = source_for(name, voice, False)
                playback = source_for(name, voice, True)
                body = (definitions + '\n' + (HERE / "observe.ily").read_text() +
                        r"\score { " + layout + r" \layout {} }" + "\n" +
                        r"\score { " + playback + r" \midi {} }")
                script = cwd / (voice + ".ly")
                script.write_text(body)
                stdout = run(["lilypond", "-dno-print-pages", str(script)], cwd)
                written = notation(stdout)
                performed = performance(cwd / (voice + ".midi"))
                assert written and performed
                observations=[("W", written), ("P", performed)]
                if name == "maple":
                    # The source's separate MIDI score expands all voltas before engraving/playback.
                    script.write_text(definitions + '\n' + (HERE / "observe.ily").read_text() +
                                      r"\score { " + playback + r" \layout {} }")
                    unfolded = notation(run(["lilypond", "-dno-print-pages", str(script)], cwd))
                    observations.append(("U", unfolded))
                for kind, values in observations:
                    for value in values:
                        rows.append("\t".join(str(v) for v in [voice, kind, *value]))
            if name == "maple" and args.published_maple_midi:
                midi=args.published_maple_midi
                assert sha256(midi.read_bytes()).hexdigest()=="3dd712a85fabd267f5a2cee5cb23af4683408c2f29b8814721844498f1ee4f66"
                notes=sorted(list(map(int,row.split("\t")[2:])) for row in rows if row.split("\t")[1]=="P")
                assert notes==performance(midi)
            snapshot = HERE / (name + ".tsv")
            output = "\n".join(rows) + "\n"
            if args.write:
                snapshot.write_text(output)
            else:
                assert snapshot.read_text() == output, snapshot
            print(name, len(rows), "native written and performed observations")


if __name__ == "__main__":
    main()

