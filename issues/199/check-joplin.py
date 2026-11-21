"""Check the first written strain against the public-domain Mutopia MIDI, including its ties."""
from collections import Counter
from fractions import Fraction
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import json
import subprocess
import sys
from urllib.request import urlopen
import mido

URL = "https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.mid"
DIGEST = "3dd712a85fabd267f5a2cee5cb23af4683408c2f29b8814721844498f1ee4f66"


def midi_events(track, stop):
    """Return pitch, onset and release; velocity-zero note-ons release their pitch."""
    now, held, notes = 0, {}, Counter()
    for message in track:
        now += message.time
        if now > stop:
            break
        if message.type not in ("note_on", "note_off"):
            continue
        if message.type == "note_on" and message.velocity:
            held[message.note] = now
        elif message.note in held:
            onset = held.pop(message.note)
            notes[onset, message.note, now - onset] += 1
    return notes


def written_events(voice, whole, visit_order):
    """Join written ties by pitch and account for the score's opening eighth-note pickup."""
    notes, previous, clock = Counter(), {}, 0
    for number in visit_order:
        bar = voice["measures"][number - 1]
        for event in voice["events"][bar["start"]:bar["end"]]:
            onset = clock + int(whole * Fraction(event["at"]))
            duration = int(whole * Fraction(event["duration"]))
            active = {}
            for head in event["heads"]:
                written = head["pitch"]
                pitch = 12 * (int(written[-1]) + 1) + {"C":0,"D":2,"E":4,"F":5,"G":7,"A":9,"B":11}[written[0]]
                pitch += written.count("#") - written.count("b")
                start = onset
                if any(m["kind"] == "tie" for m in head["marks"]):
                    start = previous[pitch]
                    notes[start, pitch, onset - start] -= 1
                notes[start, pitch, onset + duration - start] += 1
                active[pitch] = start
            previous = active
        clock += int(whole * Fraction(bar["span"]))
    return +notes, clock


if __name__ == "__main__":
    data = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else urlopen(URL, timeout=30).read()
    assert sha256(data).hexdigest() == DIGEST
    midi = mido.MidiFile(file=BytesIO(data))
    js = "console.log(JSON.stringify(require('./dist/score.cjs').parseScore(require('fs').readFileSync('guide/scores/joplin-maple-leaf.vextab','utf8'))))"
    part = json.loads(subprocess.check_output(["node", "-e", js]))["parts"][0]
    # The MIDI moves the seventh bar's right hand to the lower staff track.
    events, reference = Counter(), Counter()
    for staff, track in zip(part["staves"], midi.tracks[1:]):
        hand, stop = written_events(staff["voices"][0], midi.ticks_per_beat * 4, [1, *range(2, 18), *range(2, 17), 18])
        events.update(hand)
        reference.update(midi_events(track, stop))
    assert events == reference, (list((events-reference).items())[:5], list((reference-events).items())[:5])
    print(sum(events.values()), "note onsets, pitches and releases match through both endings")
