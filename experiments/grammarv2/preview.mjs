// Draw bounded, checked experimental scores through VexTab's public browser API.

const examples = {
  'Guitar phrase': 'pattern riff { :8 0/1 2/1 3/1 2/1 }\nguitar {\n  use riff use riff |\n}',
  'Guitar fingerings': 'meter 2/4\nguitar {\n  :8 6/4[finger 2] 7/4[hammer, finger 3]\n  :q 0/2[finger 3 right, accent] |\n}',
  'Independent piano hands': 'piano {\n  upper { C4 D4 (E4 G4) G4 | }\n  lower { :h C3 G2 | }\n}',
  'Drop D with capo and bends': 'meter 3/4\nguitar { tuning dropD capo 2\n  0/6[slideIn below] (0/6 7/3[prebend +2 release])\n  (0/6 7/3[bend +2 rise=1/2 release=1]) |\n}',
  'Lyrics and alternate endings': 'meter 2/4\nstaff {\n  volta 2 { :8 tuplet 3:2 { C4[lyric "riv" hyphen] D4[lyric "er"] E4 } :q F4 | }\n  ending 1 { :h G4 | } ending 2 { :h C4 | }\n}',
  'Independent text and signs': 'meter 2/4\nstaff {\n  :h C4 |\n  text lyrics font "Georgia" size 14 style italic ink navy line 8 {\n    start sign coda :8 "One," "and" ink crimson "three" "four" |\n  }\n}',
  'Changing meter': 'meter 2/4\nmeter 3/8 at 2\nstaff {\n  :q C4 E4 |\n  break system :8 G4 E4 C4 bar final\n}',
  'Transposed chord diagram': 'guitar {\n  transpose +2 {\n    :w (0/5 2/4 2/3 1/2 0/1)[symbol "Am/E", frame (x 0 2 2 1 0) barre=2/4..3] |\n  }\n}',
  'Guitar techniques': 'guitar { fragment {\n  :8 5/3 7/3[hammer] 5/3[pull] 7/4 5/4[slide]\n  :q 3/5[vibrato wide] x/3[write B3]\n} }',
  'Drum groove': 'drums {\n  :8 times 2 { (kick hat) hat (snare hat) hat } |\n}',
};

const input = document.querySelector('#input');
const scores = document.querySelector('#scores');
const timeline = document.querySelector('#timeline');
const status = document.querySelector('#status');
const picker = document.querySelector('#example');

/** Show the definition range of a note, even when several pattern calls share it. */
function selectSource(range) {
  input.focus();
  input.setSelectionRange(...range);
}

/** Cap DOM work independently of the compiler's event budget. */
function render() {
  scores.replaceChildren();
  timeline.replaceChildren();
  status.textContent = '';
  try {
    const score = window.vextab.parseScore(input.value, { language: 2 });
    const events = score.parts.flatMap(part => part.staves.flatMap(staff => staff.voices.flatMap(voice => voice.events)));
    if (events.length > 128) throw new Error('Score compiled. Use the CLI for timelines longer than 128 events.');
    for (const event of events) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const calls = event.trace.map(frame => frame.pattern ?? (frame.iteration ? 'iteration ' + frame.iteration : 'tuplet ' + frame.tuplet));
      button.textContent = event.id + ' · bar ' + event.bar + ' at ' + event.at + ' · ' + event.duration + ' ' + event.kind
        + (calls.length ? ' · ' + calls.join(' / ') : '');
      button.onclick = () => selectSource(event.range);
      row.append(button);
      timeline.append(row);
    }
    if (!window.vextab) throw new Error('Build the preview renderer with npm run build-dev, then reload.');
    const result = document.createDocumentFragment();
    for (const [partIndex, part] of score.parts.entries()) {
      const section = document.createElement('section');
      const title = document.createElement('h2');
      title.textContent = { guitar:'Guitar', piano:'Piano', staff:'Staff', drums:'Drums' }[part.kind];
      const surface = document.createElement('div');
      section.append(title, surface);
      result.append(section);
      const view = window.vextab.renderScore(surface, score, { width: Math.max(290, scores.clientWidth - 16), partIndex });
      surface.addEventListener('click', event => {
        const matrix = surface.querySelector('svg').getScreenCTM();
        if (!matrix) return;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        const hit = view.hitTest(point.x, point.y);
        const range = hit && view.rangeFor(hit.id, input.value);
        if (range) selectSource([range.start, range.end]);
      });
    }
    scores.replaceChildren(result);
  } catch (error) {
    status.textContent = error.message;
    if (error.range) selectSource(Array.isArray(error.range) ? error.range : [error.range.start, error.range.end]);
  }
}

for (const name of Object.keys(examples)) picker.add(new Option(name, name));
picker.onchange = () => { input.value = examples[picker.value]; render(); };
document.querySelector('#draw').onclick = render;
input.oninput = () => {
  scores.replaceChildren();
  timeline.replaceChildren();
  status.textContent = 'Edited. Render to update the preview.';
};
picker.onchange();
