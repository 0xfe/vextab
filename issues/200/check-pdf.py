"""Check physical dimensions, page counts and painted music in the guide's exported PDFs."""
import json
from pathlib import Path

import pymupdf

output = Path("build/vt6-m5")
books = json.loads((output / "chromium.json").read_text())
dimensions = {"A4": (210, 297), "Letter": (215.9, 279.4)}
total = 0
for piece in books.values():
    for edition in piece["editions"]:
        name = edition["name"]
        with pymupdf.open(output / f"{name}.pdf") as book:
            assert len(book) == edition["pages"], name
            for page in book:
                size = [n * 25.4 / 72 for n in (page.mediabox.width, page.mediabox.height)]
                assert all(abs(n - want) < 0.5 for n, want in zip(size, dimensions[edition["paper"]])), (name, size)
                raster = page.get_pixmap(matrix=pymupdf.Matrix(0.5, 0.5), colorspace=pymupdf.csGRAY)
                assert sum(t < 160 for t in raster.samples) > 120, (name, page.number)
            total += len(book)
print(f"Verified dimensions and printed ink on {total} pages")
