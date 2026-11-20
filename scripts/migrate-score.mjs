#!/usr/bin/env node
// Preview a grammar v2 translation from the musical events resolved by the v1 reader.
import { readFile, realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { text } from 'node:stream/consumers';
import { Music } from 'vexflow';
import { parseScore } from '../dist/score.cjs';

const quote = JSON.stringify;
const pitch = value => value[0].toUpperCase() + value.slice(1).replace('/', '');
const marks = list => list.length ? '[' + list.join(', ') + ']' : '';
const indent = text => text.split('\n').map(line => '  ' + line).join('\n');

/** Stop at the authored construct if choosing a translation requires an editorial decision. */
function review(range, reason) {
  throw new Error(reason + ' at line ' + range.line + ', column ' + (range.column + 1));
}

/** V2 bare letters follow the key, including after a previous chromatic pitch. */
function spelledPitch(head, signature) {
  const [name, octave] = head.written.split('/');
  if (name.length === 1 && (head.accidental === 'n' || signature[name].replace(/n$/, '') !== name))
    return name.toUpperCase() + 'n' + octave;
  return pitch(head.written);
}

function headText(score, event, head, index, extra, signature) {
  const annotations = [];
  if (score.ties.some(t => t.to === event.id && t.toHead === index)) annotations.push('tie');
  if (head.hammer) annotations.push('hammer');
  if (head.prebend) annotations.push('prebend +' + head.prebend.semitones + (head.prebend.release ? ' release' : ''));
  if (head.openSlide) annotations.push((head.openSlide.edge === 'in' ? 'slideIn ' : 'slideOut ') + head.openSlide.side);
  if (head.cautionary) annotations.push('courtesy');
  else if (head.accidental) annotations.push('showSign');
  for (const mark of head.marks ?? []) {
    if (mark.finger !== undefined) annotations.push((mark.stringNumber ? 'stringNumber ' : 'finger ') + mark.finger + ' ' + mark.position);
    else annotations.push('articulation ' + quote(mark.articulation) + ' ' + mark.position);
  }
  const bend = event.bend?.spec;
  if (bend && head.position?.str === bend.string) {
    const phases = ['rise','hold','release'].filter(key => bend[key]).map(key => key + '=' + bend[key].join('/'));
    annotations.push('bend +' + bend.semitones + ' ' + phases.join(' '));
  }
  let word;
  if (head.position) {
    word = String(head.position.fret).toLowerCase() + '/' + head.position.str;
    if (/^[A-G]/.test(score.source.slice(head.range.start, head.range.end))) annotations.push('write ' + spelledPitch(head, signature));
  } else if (head.drum) word = head.drum;
  else word = spelledPitch(head, signature);
  return word + marks([...annotations, ...extra]);
}

/** Place marks on their original chord head or on the entire attack. */
function attackText(score, event, signature) {
  const extra = [];
  if (event.color) extra.push('ink ' + event.color);
  if (event.chord) extra.push('symbol ' + quote(event.chord.text) + (event.chord.color ? ' ink ' + event.chord.color : ''));
  if (event.frame) {
    const { frets, barre } = event.frame.spec;
    extra.push('frame (' + frets.join(' ') + ')' + (barre ? ' barre=' + barre.fret + '/' + barre.from + '..' + barre.to : ''));
  }
  if (event.lyric) extra.push('lyric ' + quote(event.lyric.text) + (event.lyric.hyphen ? ' hyphen' : '') + (event.lyric.extend ? ' extend=' + event.lyric.extend : ''));
  if (event.restLine !== undefined) extra.push('line ' + event.restLine);
  if (!event.heads.length) return (event.silent ? 'skip' : 'rest') + marks(extra);
  if (event.slash && event.heads.every(h => h.sounding === null && !h.position)) return 'slash' + marks(extra);
  if (event.slash) extra.push('slash');
  if (event.heads.length === 1) return headText(score, event, event.heads[0], 0, extra, signature);
  return '(' + event.heads.map((h,i) => headText(score, event, h, i, [], signature)).join(' ') + ')' + marks(extra);
}

const boundaries = {single:'|', double:'bar double', end:'bar final', 'repeat-end':'bar repeatEnd', 'repeat-both':'bar repeatBoth'};

/** Scoped rhythms inherit the surrounding duration and restore it at their closing brace. */
function measureText(score, measure, voice, endings) {
  const words = [];
  const signature = new Music().createScaleMap(measure.state.key);
  if (measure.number > 1 && measure.newRow) words.push('break system');
  if (voice.opening?.type === 'repeat-begin' && !endings.length) words.push('repeatStart');
  if (voice.rehearsal) words.push('mark ' + quote(voice.rehearsal));
  if (measure.state.fragment) words.push('fragment {');
  let current;
  voice.events.forEach((event, index) => {
    const mute = score.spans.find(s => s.kind === 'palmMute' && s.from === event.id);
    const tuplet = voice.tuplets.find(t => t.start === index);
    if (mute) { words.push('palmMute strings(' + mute.strings.join(' ') + ') {'); current = undefined; }
    if (tuplet) { words.push('tuplet ' + tuplet.numNotes + ':' + tuplet.notesOccupied + ' {'); current = undefined; }
    const rhythm = ':' + event.base + '.'.repeat(event.dots);
    if (current !== rhythm) words.push(rhythm);
    current = rhythm;
    words.push(attackText(score, event, signature));
    if (voice.tuplets.some(t => t.start + t.count - 1 === index)) { words.push('}'); current = undefined; }
    if (score.spans.some(s => s.kind === 'palmMute' && s.to === event.id)) { words.push('}'); current = undefined; }
  });
  const type = voice.closing?.type ?? 'single';
  if (!(type in boundaries)) review(voice.closing.range, 'Review the closing barline');
  words.push(boundaries[type]);
  if (measure.state.fragment) words.push('}');
  return words.join(' ');
}

/** Keep independently counted voices in their own blocks, including the two piano hands. */
function voiceText(score, index, endings) {
  const first = score.measures[0].voices[index];
  const lines = [];
  for (const m of score.measures) {
    const v = m.voices[index];
    if (!v || v.hand !== first.hand || v.stem !== first.stem) review(m.range, 'Review the change of voice or hand');
    if (endings.length && m.number === 1) lines.push('volta ' + endings.length + ' {');
    const ending = endings.find(e => e.firstBar === m.number);
    if (ending) lines.push('} ending ' + parseInt(ending.label) + ' {');
    const measure = measureText(score, m, v, endings);
    lines.push(endings.length && m.number <= endings.at(-1).lastBar ? indent(measure) : measure);
    if (endings.at(-1)?.lastBar === m.number) lines.push('}');
  }
  return lines.join('\n');
}

/** Translate a measured score. Fixed-engraver instructions receive the v1 reader's source diagnostic. */
export function migrateScore(source) {
  if (Buffer.byteLength(source) > 65536) throw new Error('Split scores larger than 64 KiB before migration');
  const blank = /^\s*(stave|tabstave)(?:\s+strings=(\d+))?\s*$/.exec(source);
  if (blank) {
    if (blank[2] && blank[2] !== '6') review({line:1,column:source.indexOf('strings')}, 'Choose the pitches of the open strings for this empty staff');
    return blank[1] === 'stave' ? 'staff { fragment {} }\n' : 'guitar { view tab fragment {} }\n';
  }
  const score = parseScore(source);
  const { state, voices } = score.measures[0];
  const lines = [];
  if (score.measureNumbers) lines.push('measureNumbers on');
  if (score.playback) {
    const { enabled, tempo, instrument } = score.playback;
    if (enabled || tempo || instrument) lines.push('play { ' + [!enabled && 'enabled off', tempo && 'tempo ' + tempo, instrument && 'instrument ' + instrument].filter(Boolean).join(' ') + ' }');
  }
  if (state.showTime || state.meter !== '4/4') lines.push('meter ' + state.meter);
  if (state.pickup) lines.push('pickup ' + state.pickup);
  const kind = state.piano ? 'piano' : state.clef === 'percussion' && voices.some(v => v.events.some(e => e.heads.some(h => h.drum))) ? 'drums'
    : state.tab || score.measures.some(m => m.voices.some(v => v.events.some(e => e.heads.some(h => h.position)))) ? 'guitar' : 'staff';
  const settings = [];
  if (kind === 'guitar' && (!state.tab || !state.notation)) settings.push('view ' + (state.tab ? 'tab' : 'notation'));
  const tuning = name => name.includes(',') ? '(' + name.split(',').map(pitch).join(' ') + ')' : name.replace('dropd','dropD');
  if (kind === 'guitar' && state.tuning !== 'standard') settings.push('tuning ' + tuning(state.tuning));
  if (state.strings !== 6 && state.tuning === 'standard') review(state.declaration, 'Choose an explicit tuning for this string count');
  if (state.capo) settings.push('capo ' + state.capo);
  if (state.key !== 'C') settings.push('key ' + state.key);
  if (state.clef !== 'treble' && kind !== 'drums') settings.push('clef ' + state.clef);
  if (state.color) settings.push('ink ' + state.color);
  if (!state.showTime && state.meter !== '4/4') settings.push('display meter hidden');
  for (const [i,m] of score.measures.entries()) {
    if (!i) continue;
    const prev = score.measures[i-1].state;
    for (const prop of ['notation','tab','clef','capo','strings']) {
      if (prev[prop] !== m.state[prop]) review(m.state.declaration, 'Review the change of ' + prop);
    }
    if (prev.meter !== m.state.meter) lines.push('meter ' + m.state.meter + ' at ' + m.number);
    if (prev.color !== m.state.color) settings.push('ink ' + (m.state.color ?? 'default') + ' at ' + m.number);
    if (prev.tuning !== m.state.tuning) settings.push('tuning ' + tuning(m.state.tuning) + ' at ' + m.number);
    if (prev.showTime !== m.state.showTime) settings.push('display meter ' + (m.state.showTime ? 'shown' : 'hidden') + ' at ' + m.number);
    if (prev.key !== m.state.key) settings.push('key ' + m.state.key + ' at ' + m.number);
    if (m.voices.length !== voices.length) review(m.range, 'Review the change of voice count');
  }
  const endings = score.spans.filter(s => s.kind === 'volta');
  if (endings.length && (endings.length < 2 || voices[0].opening?.type !== 'repeat-begin' || endings.some((e,i) => e.label !== (i+1)+'.' || i && endings[i-1].lastBar+1 !== e.firstBar))) review(endings[0].range,'Review these repeat endings');
  function writeVoice(v, index, named) {
    const options = [v.stem && 'stem ' + v.stem, kind === 'guitar' && 'tabStems ' + (v.tabStems ? 'on' : 'off'), v.tabDirection === -1 && 'tabDirection down', !v.beams && 'beams off', !v.beamRests && 'beamRests off', v.stemlets && 'stemlets on', v.middleRests && 'middleRests on'].filter(Boolean);
    const body = voiceText(score,index,index ? [] : endings);
    if (!named) return [...options,body].join('\n');
    return ['voice', ['melody','bass'][index] ?? 'voice'+(index+1), ...options, '{'].join(' ') + '\n' + indent(body) + '\n}';
  }
  const body = [...settings];
  if (state.piano) {
    for (const hand of ['right','left']) {
      const members = voices.filter(v => v.hand === hand);
      body.push((hand === 'right' ? 'upper' : 'lower') + ' {\n' + indent(members.map(v => writeVoice(v,voices.indexOf(v),members.length > 1)).join('\n')) + '\n}');
    }
  } else body.push(...voices.map((v,i) => writeVoice(v,i,voices.length > 1)));
  lines.push(kind + ' {\n' + indent(body.join('\n')) + '\n}');
  const result = lines.join('\n') + '\n';
  parseScore(result, {language:2});
  return result;
}

if (process.argv[1] && pathToFileURL(await realpath(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: vextab-migrate [score.vextab]');
    const path = process.argv[2];
    const source = path && path !== '-' ? await readFile(path, 'utf8') : await text(process.stdin);
    process.stdout.write(migrateScore(source));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
