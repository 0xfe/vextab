// Draw bounded, checked experimental scores through VexTab's public browser API.

const examples = {
  'Guitar phrase': 'pattern riff { :8 0/1 2/1 3/1 2/1 }\nguitar {\n  use riff use riff |\n}',
  'Guitar fingerings': 'meter 2/4\nguitar {\n  :8 6/4[finger 2] 7/4[hammer, finger 3]\n  :q 0/2[finger 3 right, accent] |\n}',
  'Independent piano hands': 'piano {\n  upper { C4 D4 (E4 G4) G4 | }\n  lower { :h C3 G2 | }\n}',
  'Drum groove': 'drums {\n  :8 times 2 { (kick hat) hat (snare hat) hat } |\n}',
};

/** Spell an ordinary or dotted written duration in the engraving grammar. */
function writtenTime(fraction) {
  const [numerator, denominator] = fraction.split('/').map(Number);
  const dots = [1, 3, 7].indexOf(numerator);
  const unit = denominator / 2 ** dots;
  const names = {1:'w', 2:'h', 4:'q', 8:'8', 16:'16', 32:'32', 64:'64'};
  if (dots < 0 || !names[unit]) throw new Error('The preview cannot engrave duration ' + fraction);
  return ':' + names[unit] + 'd'.repeat(dots);
}

/** The preview sends only known musical tokens to the existing notation renderer. */
function spellHead(head, accent) {
  let token;
  if (head.drum) token = head.drum;
  else if (head.pitch) token = head.pitch.slice(0, -1).replaceAll('b', '@') + '/' + head.pitch.at(-1);
  else token = (head.fret === 'x' ? 'X' : head.fret) + '/' + head.string;
  const marks = [];
  for (const mark of head.marks) {
    if (mark.kind === 'hammer') token = 'h' + token;
    else if (mark.kind === 'finger') marks.push('f' + mark.value + ':' + mark.side);
    else throw new Error('This head mark is available in the timeline only.');
  }
  if (accent) marks.push('>');
  if (head.drum && marks.length) throw new Error('Percussion annotations are available in the timeline only.');
  return token + (marks.length ? '[' + marks.join(', ') + ']' : '');
}

/** Lower one checked part. Each staff keeps its own voices on the same bar timeline. */
function engraveSource(part, meter) {
  const declarations = { guitar:'tabstave notation=true', piano:'piano', staff:'stave', drums:'stave clef=percussion' };
  const lines = [];
  let fixed = false;
  for (const staff of part.staves) {
    for (const [index, voice] of staff.voices.entries()) {
      let declaration = lines.length ? 'voice' : declarations[part.kind] + ' time=' + meter;
      if (part.kind === 'piano' && lines.length) declaration += staff.name === 'upper' ? ' hand=right' : ' hand=left';
      if (staff.voices.length > 1) declaration += index === 0 ? ' voice=top' : ' voice=bottom';
      lines.push(declaration);
      const tokens = ['notes'];
      // Consume score spans by event ID so the same preview works after JSON serialization.
      const starts = new Map();
      for (const span of voice.spans.filter(span => span.kind === 'tuplet')) {
        if (starts.has(span.first)) throw new Error('Nested tuplets are available in the timeline only.');
        starts.set(span.first, span);
      }
      let tuplet, tupletNotes = 0;
      for (const [i, event] of voice.events.entries()) {
        const start = starts.get(event.id);
        if (start) {
          if (tuplet || !['3:2', '5:4'].includes(start.ratio))
            throw new Error('Nested tuplets and additional ratios are available in the timeline only.');
          tuplet = start;
        }
        if (event.heads.some(head => head.hammerFrom)) fixed = true;
        const heads = event.heads.map((head, h) => spellHead(head, !h && event.marks.length > 0));
        const attack = heads.length > 1 ? '(' + heads.join('.') + ')' : heads[0] ?? '##';
        tokens.push(writtenTime(event.writtenDuration), attack);
        if (event.kind === 'skip') tokens.push('!silent!');
        if (tuplet) {
          tupletNotes++;
          const next = voice.events[i + 1];
          if (tuplet.last === event.id) {
            tokens.push('^' + tuplet.ratio.split(':')[0] + ',' + tupletNotes + '^');
            tupletNotes = 0;
            tuplet = undefined;
          } else if (next.bar !== event.bar) throw new Error('Cross-bar tuplets are available in the timeline only.');
        }
        if (voice.events[i + 1]?.bar !== event.bar) tokens.push('|');
      }
      lines.push(tokens.join(' '));
    }
  }
  return { source: lines.join('\n'), fixed };
}

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
    for (const part of score.parts) {
      const section = document.createElement('section');
      const title = document.createElement('h2');
      title.textContent = { guitar:'Guitar', piano:'Piano', staff:'Staff', drums:'Drums' }[part.kind];
      const surface = document.createElement('div');
      section.append(title, surface);
      result.append(section);
      const { source, fixed } = engraveSource(part, score.meter);
      const width = Math.max(290, scores.clientWidth - 16);
      const { Artist, Vex, VexTab, parseScore, renderScore } = window.vextab;
      try {
        if (fixed) {
          // Hammer-ons are native to the fixed guitar engraver.
          const artist = new Artist(10, 10, width);
          new VexTab(artist).parse(source);
          artist.render(new Vex.Flow.Renderer(surface, Vex.Flow.Renderer.Backends.SVG));
        } else renderScore(surface, parseScore(source), { width });
      } catch (error) {
        throw new Error('The timeline compiled. The engraving adapter reported: ' + error.message);
      }
    }
    scores.replaceChildren(result);
  } catch (error) {
    status.textContent = error.message;
    if (Array.isArray(error.range)) selectSource(error.range);
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
