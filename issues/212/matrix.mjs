// Re-import the named corpus through both modes and check the published, reproducible coverage table.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseScore } from 'vextab/parse';
import { importMusicXML } from '../../importer/dist/musicxml.js';
import { importMXL } from '../../importer/dist/mxl.js';
import { importLilyPond } from '../../importer/dist/lilypond.js';

const rows = [];
/** A case is one source plus one explicit selection. Tags describe the musical question under test. */
function add(file, tags, options = {}, label = basename(file), outside = false) {
  rows.push({ file, tags, options, label, outside });
}
for (const ext of ['ly', 'musicxml']) {
  add('importer/test/voices.' + ext, ['Voices and time', 'Spelled pitch']);
  add('importer/test/measured.' + ext, ['Chords and tuplets']);
}
for (const [name, tags] of [
  ['backup', ['Voices and time']],
  ['divisions', ['Voices and time']],
  ['hidden', ['Voices and time']],
  ['21c-Chords-ThreeNotesDuration', ['Chords and tuplets']],
  ['46e-PickupMeasure-SecondVoiceStartsLater', ['Voices and time']],
  ['stored.mxl', ['MXL']],
  ['deflated.mxl', ['MXL']],
])
  add('issues/208/fixtures/' + name + (name.includes('.') ? '' : '.musicxml'), tags);
for (const [name, tags] of [
  ['relative', ['Spelled pitch']],
  ['context', ['Staff changes']],
  ['parallel', ['Voices and time']],
  ['endings', ['Repeats and endings']],
])
  add('issues/209/' + name + '.ly', tags);
for (const [name, tags] of [
  ['song', ['Lyrics and expression']],
  ['keyboard', ['Staff changes', 'Lyrics and expression']],
  ['kit', ['Percussion']],
  ['guitar', ['Guitar and TAB']],
])
  add('issues/211/fixtures/' + name + '.musicxml', tags);
for (const [name, tags] of [
  ['33g-Slur-ChordedNotes', ['Chords and tuplets', 'Lyrics and expression']],
  ['61j-Lyrics-Elisions', ['Lyrics and expression']],
  ['71c-ChordsFrets', ['Guitar and TAB']],
  ['71e-TabStaves', ['Guitar and TAB']],
  ['73a-Percussion', ['Percussion']],
])
  add('issues/211/xml/' + name + '.musicxml', tags);
for (const [name, tags] of [
  ['testChangeTranspose', ['Staff changes', 'Spelled pitch']],
  ['testTuplets1', ['Chords and tuplets']],
  ['testIncompleteTuplet', ['Chords and tuplets']],
  ['testLyricsVoice2a', ['Lyrics and expression']],
  ['testTablature1', ['Guitar and TAB']],
])
  add('build/importer-m3/' + name + '.xml', tags);
add(
  'build/importer-m3/prayer_of_a_tired_child.musicxml',
  ['Lyrics and expression'],
  { selection: { parts: ['P1'], firstMeasure: 1, lastMeasure: 6 } },
  'Beach, soprano bars 1–6',
);
add(
  'issues/210/fixtures/haydn.mxl',
  ['MXL', 'Voices and time', 'Lyrics and expression'],
  { capacity: 'large', selection: { firstMeasure: 129, lastMeasure: 237 } },
  'Haydn, movement II',
);
add(
  'issues/210/fixtures/haydn.mxl',
  ['MXL', 'Repeats and endings'],
  { capacity: 'large' },
  'Haydn, all four movements',
);
add('issues/211/fixtures/chord-mode.ly', ['Chords and tuplets']);
add(
  'issues/211/fixtures/joplin-first.ly',
  ['Voices and time', 'Repeats and endings'],
  {},
  'Joplin, first strain',
);
for (const [id, title, tags, options] of [
  ['sor', 'Sor Op. 35 No. 22', ['Guitar and TAB', 'Repeats and endings'], { guitar: true }],
  ['bwv999', 'Bach BWV 999', ['Guitar and TAB', 'Voices and time'], { guitar: true }],
  [
    'maple',
    'Joplin, complete Maple Leaf Rag',
    ['Voices and time', 'Repeats and endings'],
    { finalFragment: true },
  ],
])
  for (const score of ['print', 'midi'])
    add('issues/212/lilypond/' + id + '.ly', tags, { ...options, score }, title + ', ' + score);
add(
  'issues/210/fixtures/haydn.mxl',
  ['MXL', 'Repeats and endings'],
  { capacity: 'large', selection: { firstMeasure: 1, lastMeasure: 128 } },
  'Haydn, movement I',
);
for (const name of ['45a-SimpleRepeat', '45b-RepeatWithAlternatives', '45d-Repeats-MultipleEndings']) {
  add('issues/212/musicxml/' + name + '.musicxml', ['Repeats and endings']);
}
add(
  'issues/212/musicxml/Echigo-Jishi.mxl',
  ['MXL', 'Lyrics and expression'],
  {},
  'Echigo-Jishi, complete song',
);
add(
  'build/importer-m5/musicxml/bwv269.mxl',
  ['MXL', 'Voices and time', 'Repeats and endings'],
  {},
  'Bach BWV 269, complete chorale',
);
add(
  'build/importer-m5/musicxml/Dichterliebe01.mxl',
  ['MXL', 'Lyrics and expression'],
  {},
  'Schumann, Dichterliebe No. 1',
);
add('issues/212/scheme.ly', ['Procedural music'], {}, 'Computed LilyPond music', true);

const counts = new Map();
const statuses = ['exact', 'partial', 'failed', 'outside'];
/** A partial score increments partial for every tag on that score. These are score-level outcomes. */
function count(group, status) {
  if (!counts.has(group)) counts.set(group, [0, 0, 0, 0]);
  counts.get(group)[statuses.indexOf(status)]++;
}
const table = [];
for (const { file, tags, options, label, outside } of rows) {
  const bytes = readFileSync(file);
  const lily = file.endsWith('.ly'),
    mxl = file.endsWith('.mxl');
  const input = lily ? bytes.toString() : bytes;
  const source = mxl ? '' : bytes.toString();
  const version = lily
    ? source.match(/\\version\s+"([^"]+)"/)?.[1]
    : source.match(/<score-(?:partwise|timewise)\b[^>]*?version="([^"]+)"/)?.[1];
  const convert = lily ? importLilyPond : mxl ? importMXL : importMusicXML;
  const outcomes = [];
  for (const mode of ['strict', 'partial']) {
    const result = await convert(input, {
      filename: basename(file),
      targetProfile: 'expressive',
      ...options,
      mode,
    });
    if (result.status === 'failed') {
      assert.deepEqual(result.documents, []);
      assert.ok(
        result.diagnostics.some((d) => d.severity === 'error'),
        label,
      );
    } else {
      const model = parseScore(result.documents[0].text, { capacity: options.capacity });
      assert.ok(model.parts.length && model.parts.every((p) => p.measureCount > 0), label);
      assert.equal(result.status === 'exact', result.diagnostics.length === 0, label);
    }
    for (const d of result.diagnostics) {
      assert.ok(d.file && d.range[0] >= 0 && d.range[0] <= d.range[1], label);
      if (!mxl) assert.ok(d.range[1] <= source.length, label);
    }
    outcomes.push(result.status);
  }
  if (outside) assert.deepEqual(outcomes, ['failed', 'failed']);
  const status = outside ? 'outside' : outcomes[1];
  for (const tag of ['All cases', ...tags]) count(tag, status);
  const format = (lily ? 'LilyPond' : mxl ? 'MXL' : 'MusicXML') + (version ? ' ' + version : '');
  table.push('| ' + [label, format, ...outcomes, tags.join(', ')].join(' | ') + ' |');
}
const report = [
  '# Importer qualification corpus',
  '',
  'Each row is one named input and selection on the expressive target. Both columns show actual conversion status. Every emitted document must reparse. The outcome counts use partial mode. A case explicitly outside the static-language profile counts only in the last column. Each score counts once per listed feature, so feature rows overlap. A partial result can preserve the feature under study while reporting a loss elsewhere in that score. Versions are declarations from the decoded source when available.',
  '',
  '| Cases | Exact | Partial | Failed | Out of profile |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...[...counts].map(([tag, values]) => '| ' + [tag, ...values].join(' | ') + ' |'),
  '',
  '| Score or fixture | Source | Strict | Partial mode | Features under test |',
  '| --- | --- | --- | --- | --- |',
  ...table,
  '',
].join('\n');
const output = new URL('coverage.md', import.meta.url);
if (process.argv.includes('--write')) writeFileSync(output, report);
else
  assert.equal(
    readFileSync(output, 'utf8'),
    report,
    'Review outcomes before updating coverage.md with --write',
  );
