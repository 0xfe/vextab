"""Extract the pinned CC0 quartet excerpt, retaining all voices and inherited opening clefs."""
import copy
import hashlib
from pathlib import Path
import runpy
import sys
from xml.etree import ElementTree as ET
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

reference = runpy.run_path(str(Path(__file__).parents[1] / '197/check-edition.py'))
archive = Path(sys.argv[1])
assert hashlib.sha256(archive.read_bytes()).hexdigest() == reference['DIGEST']
with ZipFile(archive) as source:
    root = ET.fromstring(source.read('score.xml'))
for part in root.findall('part'):
    bars = part.findall('measure')
    clefs = [c for m in bars[:128] for c in m.findall('attributes/clef')]
    opening = bars[128].find('attributes')
    if clefs and opening.find('clef') is None:
        opening.append(copy.deepcopy(clefs[-1]))
    for measure in bars[:128] + bars[170:]:
        part.remove(measure)
container = b'<container><rootfiles><rootfile full-path="scores/quartet.xml"/></rootfiles></container>'
destination = Path(__file__).with_name('fixtures') / 'haydn-excerpt.mxl'
with ZipFile(destination, 'w') as out:
    for name, contents in [('preview.txt', b'Haydn'), ('scores/quartet.xml', ET.tostring(root, encoding='utf-8')),
                           ('META-INF/container.xml', container)]:
        out.writestr(ZipInfo(name), contents, compress_type=ZIP_DEFLATED)
