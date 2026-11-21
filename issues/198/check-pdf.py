"""Verify each exported physical page using PyMuPDF, independently of the browser."""
from pathlib import Path
import pymupdf

OUTPUT = Path("build/vt6-m3")
PAPER = {"A4": (210, 297), "Letter": (215.9, 279.4)}
PLAYERS = ["conductor", "violin_i", "violin_ii", "viola", "cello"]


def check_book(target, paper, dimensions):
    """Compare the actual PDF MediaBox with the requested paper and its corresponding outlined SVG."""
    name = f"{target}-{paper}"
    with pymupdf.open(OUTPUT / f"{name}.pdf") as book:
        for i, page in enumerate(book, start=1):
            size = [length * 25.4 / 72 for length in (page.mediabox.width, page.mediabox.height)]
            if any(abs(actual - expected) > 0.5 for actual, expected in zip(size, dimensions)):
                raise ValueError(f"{name} page {i}: incorrect MediaBox {size} mm")
            if not (OUTPUT / f"{name}-{i}.svg").is_file():
                raise ValueError(f"{name} page {i}: missing outlined SVG")
        print(f"{name}: {len(book)} pages, {size[0]:.2f} × {size[1]:.2f} mm")


if __name__ == "__main__":
    for target in PLAYERS:
        for paper, dimensions in PAPER.items():
            check_book(target, paper, dimensions)
