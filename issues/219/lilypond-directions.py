"""Print native engraving observations for the complete pinned BWV 846 fugue."""
from fractions import Fraction
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
import os
import re
import subprocess

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / "212/complex-lilypond/bwv846.ly"


def run(command, cwd):
    """Keep the native engine's files and caches in the temporary working directory."""
    result = subprocess.run(command, cwd=cwd, env=dict(os.environ, XDG_CACHE_HOME=str(cwd)),
                            capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout


def main():
    source = SOURCE.read_bytes()
    assert sha256(source).hexdigest() == "10d51eabac0fdfeddcbb7d76ad3bf361d4c095feec3ce7aa61d034d5b836c708"
    with TemporaryDirectory() as temp:
        cwd = Path(temp)
        assert run(["lilypond", "--version"], cwd).startswith("GNU LilyPond 2.26.0 ")
        filename = cwd / "fugue.ly"
        filename.write_bytes(source)
        run(["convert-ly", "--edit", str(filename)], cwd)
        # Add an observer, leaving the score's named voices, explicit breaks and settings together.
        score = filename.read_text()
        observer = (HERE / "lilypond-directions.ily").read_text()
        filename.write_text(score.replace(r"\score {", observer + "\n" + r"\score {", 1))
        output = run(["lilypond", "-dno-print-pages", str(filename)], cwd)
    rows = set()
    for voice, onset, kind, side, duration_log in re.findall(r"M6DIR\t(\w+)\t([\d/]+)\t(stem|tie)\t(-?1)\t(\d+)", output):
        if kind == "stem" and int(duration_log) == 0:
            continue
        tick = Fraction(onset) * 1536
        assert tick.denominator == 1
        # Fragments on either side of a break report the same authored tie.
        rows.add(f"{voice}\t{int(tick)}\t{kind}\t{side}")
    assert len(rows) == 834
    print("\n".join(sorted(rows)))


if __name__ == "__main__":
    main()
