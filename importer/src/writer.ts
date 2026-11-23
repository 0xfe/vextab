// Translate resolved source events into editable VexTab grammar v2 within the public compiler limits.
import type { Event, Input, Measure, Pitch } from './score.js';
import { eventMarks, graceMark, headMarks, instrumentSettings, Names } from './write-expression.js';
import { includesExtended, keys, minorKeys } from './score.js';
import { Time, zero } from './time.js';
import type { ImportedDocument, TextRange } from './types.js';

/** VexTab infers unmarked letters from the signature, including after a chromatic note. */
function spelling(p: Pitch, key: string, input: Input, range: TextRange) {
  if (p.octave < 0 || p.octave > 9 || p.sounding < 0 || p.sounding > 127 || Math.abs(p.alter) > 2)
    input.fail('unsupported', 'Pitch exceeds the written or sounding target range.', range);
  const fifths = (key.endsWith('m') ? minorKeys : keys).indexOf(key) - 7;
  const altered = (fifths < 0 ? 'BEADGCF' : 'FCGDAEB').slice(0, Math.abs(fifths));
  const sign = p.alter ? ['bb', 'b', '', '#', '##'][p.alter + 2] : altered.includes(p.step) ? 'n' : '';
  return p.step + sign + p.octave;
}

type Tuplet = NonNullable<Event['tuplets']>[number];

/** One buffer keeps output offsets and package-wide capacity checks independent of the active voice. */
class Writer {
  text = '';
  map: NonNullable<ImportedDocument['sourceMap']> = [];
  readonly names = new Names();
  events = 0;
  rhythm = '';
  tuplets: Tuplet[] = [];
  constructor(readonly input: Input, readonly range: TextRange) {}

  /** Leave and enter scope at the common prefix. Durations are explicitly reset at scope edges. */
  groups(next: Tuplet[], range: TextRange) {
    let shared = 0;
    while (shared < this.tuplets.length && shared < next.length && this.tuplets[shared].id === next[shared].id) shared++;
    if (shared === next.length && shared === this.tuplets.length) return;
    this.text += ' }'.repeat(this.tuplets.length - shared);
    for (const t of next.slice(shared)) {
      if (![t.actual, t.normal].every(n => Number.isInteger(n) && n > 0 && n <= 16))
        this.input.fail('unsupported', 'Tuplet ratio exceeds the target limit.', range);
      this.text += ' tuplet ' + t.actual + ':' + t.normal + ' {';
    }
    this.rhythm = '';
    this.tuplets = next;
  }

  append(token: string, denominator: number, dots: number, event?: Event) {
    const range = event?.range ?? this.range;
    const limit=this.input.options.capacity==='large'?32768:4096;
    if (++this.events > limit) this.input.fail('limit','Generated score exceeds '+limit+' events. Select fewer measures or a larger target capacity.',range);
    const base = ({ 1: 'w', 2: 'h', 4: 'q' } as Record<number, string>)[denominator] ?? denominator;
    if (![1,2,4,8,16,32,64,128,256].includes(denominator) || ![0,1,2].includes(dots))
      this.input.fail('unsupported', 'Unsupported written duration.', range);
    const rhythm = ':' + base + '.'.repeat(dots);
    if (rhythm !== this.rhythm) this.text += ' ' + rhythm;
    this.rhythm = rhythm;
    this.text += ' ';
    const start = this.text.length;
    this.text += token;
    if (event && this.input.options.sourceMap) {
      for (const original of event.headRanges ?? [range]) this.map.push({ generated: [start, this.text.length], original,
        ...(event.file && {file: event.file}), ...(event.uses && {uses: event.uses}) });
    }
  }

  /** Fill only the uncovered interval. A skip takes time without adding a printed rest. */
  silence(gap: Time, range: TextRange) {
    if (gap.compare(zero) === 0) return;
    this.groups([], range);
    if (gap.compare(zero) < 0) this.input.fail('timing', 'Overlapping events in one voice.', range);
    if (256n % gap.denominator !== 0n) this.input.fail('unsupported', 'Cannot spell this gap with binary skips.', range);
    let remaining = Number(gap.numerator * (256n / gap.denominator));
    while (remaining > 0) {
      const units = Math.min(256, 2 ** Math.floor(Math.log2(remaining)));
      this.append('skip', 256 / units, 0);
      remaining -= units;
    }
  }

  event(event: Event, bar: Measure) {
    this.groups(event.tuplets ?? [], event.range);
    const dots = event.dots ?? 0;
    if (!Number.isSafeInteger(event.denominator) || event.denominator <= 0 || ![0,1,2].includes(dots))
      this.input.fail('unsupported', 'Invalid written duration.', event.range);
    let written = new Time(2 ** (dots + 1) - 1, event.denominator * 2 ** dots);
    for (const t of this.tuplets) written = new Time(written.numerator * BigInt(t.normal), written.denominator * BigInt(t.actual));
    // Grammar v2 uses bounded rationals even when the source can describe finer subdivisions.
    const targetLimit = 2147483647n;
    for (const time of [written, event.at, event.at.plus(event.elapsed)]) {
      if (time.numerator > targetLimit || time.denominator > targetLimit)
        this.input.fail('limit', 'Exact event time exceeds the target fraction limit.', event.range);
    }
    if (written.compare(event.elapsed)) this.input.fail('timing', 'Written duration differs from elapsed duration.', event.range);
    const heads = event.pitches ?? (event.pitch ? [event.pitch] : []);
    const count = Math.max(heads.length, event.headDetails?.length ?? 0);
    if (count > 16) this.input.fail('limit', 'Chord exceeds 16 heads.', event.range);
    if ((event.expression || event.headDetails) && this.input.options.targetProfile !== 'expressive')
      this.input.fail('unsupported', 'Expressive notation requires the VexTab 6.4.0 target.', event.range);
    const note = (p: Pitch) => spelling(p, event.key ?? bar.key, this.input, event.range);
    const marks = event.expression ? eventMarks(event.expression, this.names) : [];
    const tokens: string[] = [];
    for (let i = 0; i < count; i++) {
      const detail = event.headDetails?.[i];
      const decorations = detail ? headMarks(detail, this.names) : [];
      if (event.tieStop && !detail?.tieStop && !detail?.tieEndId) decorations.push('tie');
      let token: string;
      if (detail?.drum) {
        token = this.names.get('hit', detail.drum);
      } else if (detail?.fret !== undefined && detail.string !== undefined) {
        token = detail.fret + '/' + detail.string;
        if (heads[i] && detail.fret !== 'x') decorations.unshift('write ' + note(heads[i]));
      } else if (heads[i]) {
        token = note(heads[i]);
      } else return this.input.fail('unsupported', 'Missing note pitch or instrument position.', event.range);
      if (count === 1) marks.unshift(...decorations);
      else if (decorations.length) token += '[' + decorations.join(', ') + ']';
      tokens.push(token);
    }
    if (event.staff !== bar.staff) {
      if (!bar.piano || ![1, 2].includes(event.staff)) this.input.fail('unsupported', 'Unknown display staff.', event.range);
      if (event.kind !== 'skip') marks.push('onStaff ' + (event.staff === 1 ? 'upper' : 'lower'));
    }
    let token = count > 1 ? '(' + tokens.join(' ') + ')' : tokens[0] ?? event.kind;
    if (event.grace?.length) marks.push(graceMark(event, note));
    if (marks.length) token += '[' + marks.join(', ') + ']';
    this.append(token, event.denominator, dots, event);
  }

  /** Repeat marks surround the written body. An ending owns its own written measures. */
  bar(bar: Measure, voice: string, structured: boolean, first: boolean) {
    this.input.context = { part: bar.part, measure: bar.label, voice };
    const range = bar.range ?? this.range;
    const full = new Time(bar.beats, bar.beatType);
    const length = bar.pickup ?? bar.fragment ?? full;
    if (!bar.voices.size || bar.extent.compare(length) !== 0 || length.compare(zero) <= 0 || length.compare(full) > 0)
      this.input.fail('timing', 'Expected one complete measure or a declared short measure.', range);
    if (bar.pickup && !first) this.input.fail('unsupported', 'Pickup must be the first measure.', range);
    if (bar.ending) this.text += ' ending ' + bar.ending + ' {';
    if (bar.repeatStart) {
      if (!structured && bar.repeatStart !== 2) this.input.fail('unsupported', 'A simple repeat requires two passes.', range);
      this.text += structured ? ' volta ' + bar.repeatStart + ' {' : ' repeatStart';
    }
    if (bar.fragment) this.text += ' fragment {';
    this.rhythm = '';
    let cursor = zero;
    const visual=bar.changes.filter(change=>change.kind!=='sounds').sort((a,b)=>a.at.compare(b.at));
    // Split unoccupied intervals at every inline glyph so each voice has a target onset.
    let next=0;
    const silenceTo=(end:Time,range:TextRange)=>{
      while (next<visual.length && visual[next].at.compare(end)<=0) {
        const at=visual[next++].at;
        this.silence(at.minus(cursor),range);cursor=at;
      }
      this.silence(end.minus(cursor),range);cursor=end;
    };
    for (const e of (bar.voices.get(voice) ?? []).slice().sort((a,b) => a.at.compare(b.at))) {
      this.input.file = e.file ?? this.input.rootFile;
      silenceTo(e.at,e.range);
      const end=e.at.plus(e.elapsed);
      if (next<visual.length && visual[next].at.compare(end)<0) {
        if (e.kind!=='skip') this.input.fail('unsupported','Inline '+visual[next].kind+' crosses a sustained voice event.',visual[next].range);
        silenceTo(end,e.range);
      } else {
        this.event(e,bar);
        cursor=end;
      }
    }
    silenceTo(length,range);
    this.groups([], range);
    this.text += bar.repeatEnd && !structured ? ' bar repeatEnd' : ' |';
    if (bar.fragment) this.text += ' }';
    if (bar.repeatEnd && structured || bar.endingEnd) this.text += ' }';
  }
}

/** Validate consecutive alternatives before choosing printed repeat or structured volta syntax. */
function repeatForms(bars: Measure[], input: Input, range: TextRange) {
  const structured = new Set<number>();
  let start = -1, alternatives = 0, expected = 0, activeEnding = false;
  for (const [i, bar] of bars.entries()) {
    const fail = () => input.fail('unsupported', 'Incomplete or overlapping repeat structure.', bar.range ?? range);
    if (alternatives && !activeEnding && !bar.ending) fail();
    if (bar.repeatStart) {
      if (start >= 0 || alternatives || bar.repeatStart < 2 || bar.repeatStart > 32) fail();
      start = i;
    }
    if (bar.repeatEnd) {
      if (start < 0) fail();
      if (bars[i + 1]?.ending) {
        alternatives = bars[start].repeatStart!;
        expected = 1;
        structured.add(start);
        structured.add(i);
      }
      start = -1;
    }
    if (bar.ending) {
      if (activeEnding || !alternatives || bar.ending !== expected) fail();
      activeEnding = true;
    }
    if (bar.endingEnd) {
      if (!activeEnding) fail();
      activeEnding = false;
      if (expected++ === alternatives) alternatives = 0;
    }
  }
  if (start >= 0 || alternatives) input.fail('unsupported', 'Unclosed repeat or alternatives.', range);
  return structured;
}

/** Keep every voice on the same grid, even when the source omits it for entire measures. */
export function writeScore(bars: Measure[], input: Input, range: TextRange): ImportedDocument {
  if (!bars.length) input.fail('syntax', 'No measures in the selected score.', range);
  const grouped = new Map<string, Measure[]>();
  for (const bar of bars) {
    const id = JSON.stringify([bar.part, bar.staff]);
    const group = grouped.get(id);
    if (group) group.push(bar);
    else grouped.set(id, [bar]);
  }
  const first = bars[0], writer = new Writer(input, range);
  const meter = (bar: Measure) => bar.beats + '/' + bar.beatType;
  writer.text = 'meter ' + meter(first) + '\n';
  if (first.pickup) writer.text += 'pickup ' + first.pickup.numerator + '/' + first.pickup.denominator + '\n';
  const staves: NonNullable<ImportedDocument['staves']> = [];
  const extended = includesExtended(input.options);
  /** Express measure-local positions exactly. The first bar is one. */
  function anchor(index:number, at:Time) {
    return ' at '+(index+1)+(at.numerator?' + '+at.numerator+'/'+at.denominator:'');
  }
  const tempos=new Map<string,{index:number; bpm:number; at:Time}>();
  for (const measures of grouped.values()) for (const [index,bar] of measures.entries()) {
    for (const tempo of bar.tempos) {
      const key=anchor(index,tempo.at);
      const prior=tempos.get(key);
      if (prior && prior.bpm!==tempo.bpm) input.fail('unsupported','Conflicting simultaneous score tempos.',tempo.range);
      tempos.set(key,{index,bpm:tempo.bpm,at:tempo.at});
    }
  }
  if (tempos.size) {
    writer.text+='play {\n';
    for (const tempo of [...tempos.values()].sort((a,b)=>a.index-b.index || a.at.compare(b.at))) {
      writer.text+='  tempo '+tempo.bpm+anchor(tempo.index,tempo.at)+'\n';
    }
    writer.text+='}\n';
  }
  /** Declare opening settings and compare each later bar to the preceding bar's *ending* state. */
  function settings(measures: Measure[], hand=false) {
    const opening=measures[0];
    if (!hand && opening.name) writer.text+='  name '+JSON.stringify(opening.name)+'\n';
    if ((!opening.piano && opening.clef!=='treble') || hand && opening.clef!==(opening.staff===1?'treble':'bass'))
      writer.text+='  clef '+opening.clef+'\n';
    writer.text+='  key '+opening.key+'\n';
    if (opening.instrument) {
      if (input.options.targetProfile !== 'expressive') input.fail('unsupported', 'Instrument mapping requires the expressive target.', opening.range ?? range);
      for (const field of instrumentSettings(opening.instrument, writer.names, input, opening.range ?? range))
        writer.text += '  ' + field + '\n';
    }
    if (opening.sounds) writer.text+='  sounds '+opening.sounds+' at 1\n';
    const current={clef:opening.clef,key:opening.key,sounds:opening.sounds} as Record<string,string|number>;
    for (const [i,bar] of measures.entries()) {
      for (const kind of ['key','clef','sounds'] as const) {
        if (bar[kind]===current[kind]) continue;
        if (!extended && kind!=='key') input.fail('unsupported','Timed '+kind+' requires the extended target.',bar.range ?? range);
        writer.text+='  '+kind+' '+bar[kind]+anchor(i,zero)+'\n';
        current[kind]=bar[kind];
      }
      const prev=i?measures[i-1]:first;
      if (!hand && meter(bar)!==meter(prev)) writer.text+='  meter '+meter(bar)+(i?' at '+(i+1):'')+'\n';
      for (const change of bar.changes) {
        if (!extended) input.fail('unsupported','Inline staff state requires the extended target.',change.range);
        writer.text+='  '+change.kind+' '+change.value+anchor(i,change.at)+'\n';
        current[change.kind]=change.value;
      }
    }
  }

  /** Source IDs can be arbitrary strings. Generate predictable legal voice names in first-appearance order. */
  function voicesFor(measures: Measure[], target: string) {
    const opening = measures[0];
    if ((opening.pickup ?? zero).compare(first.pickup ?? zero)) input.fail('unsupported', 'Staves must share the pickup.', range);
    const ids = new Set(measures.flatMap(bar => [...bar.voices.keys()]));
    const voices = [...ids].map((source,i) => ({source, target: ['upper','lower'][i] ?? 'voice' + (i + 1)}));
    staves.push({ target, part: opening.part, staff: opening.staff, measures: measures.map(b => b.label), voices });
    const forms = repeatForms(measures, input, range);
    for (const voice of voices) {
      writer.text += '  voice ' + voice.target + ' {';
      for (const [i, bar] of measures.entries()) {
        if (i) writer.text += '\n   ';
        writer.bar(bar, voice.source, forms.has(i), !i);
      }
      writer.text += ' }\n';
    }
  }

  const keyboards = new Set<string>();
  for (const measures of grouped.values()) {
    const opening = measures[0], id = 'staff' + (staves.length + 1);
    if (opening.piano) {
      if (keyboards.has(opening.part)) continue;
      keyboards.add(opening.part);
      const upper = grouped.get(JSON.stringify([opening.part, 1]));
      const lower = grouped.get(JSON.stringify([opening.part, 2]));
      if (!upper || !lower || upper.length !== lower.length)
        return input.fail('unsupported', 'Piano hands must share a measure grid.', range);
      for (const [i, bar] of upper.entries()) {
        const bass = lower[i];
        if (!bar.piano || !bass.piano || (!extended && (bar.clef !== 'treble' || bass.clef !== 'bass')) || meter(bar) !== meter(bass)
            || !extended && bar.key !== bass.key || bar.extent.compare(bass.extent))
          input.fail('unsupported', 'Independent piano hand settings require a newer target profile.', bass.range ?? range);
      }
      writer.text += 'piano ' + id + ' {\n';
      if (extended) {
        if (opening.name) writer.text+='  name '+JSON.stringify(opening.name)+'\n';
        for (const [i,bar] of upper.entries()) if (meter(bar)!==meter(i?upper[i-1]:first))
          writer.text+='  meter '+meter(bar)+(i?' at '+(i+1):'')+'\n';
      } else settings(upper);
      for (const [hand, bars] of [['upper', upper], ['lower', lower]] as const) {
        writer.text += '  ' + hand + ' {\n';
        if (extended) settings(bars,true);
        voicesFor(bars, id + '/' + hand);
        writer.text += '  }\n';
      }
    } else {
      const kind = opening.instrument?.kind ?? 'staff';
      writer.text += kind + (grouped.size > 1 ? ' ' + id : '') + ' {\n';
      settings(measures);
      voicesFor(measures, grouped.size > 1 ? id : kind);
    }
    writer.text += '}\n';
  }
  if (extended) {
    const seen=new Set<string>();
    for (const bar of bars) {
      if (!bar.group) continue;
      const key=JSON.stringify([bar.group.symbol,bar.group.parts]);
      if (seen.has(key)) continue;
      seen.add(key);
      const members=new Set(staves.filter(staff=>bar.group!.parts.includes(staff.part)).map(staff=>staff.target.split('/')[0]));
      if (members.size>1) writer.text+='group '+bar.group.symbol+' ('+[...members].join(' ')+')\n';
    }
  }
  const large=input.options.capacity==='large', bytes=large?1048576:65536, tokenLimit=large?131072:8192;
  if (new TextEncoder().encode(writer.text).length > bytes) input.fail('limit','Generated score exceeds '+bytes+' UTF-8 bytes. Select fewer measures or a larger capacity.',range);
  const tokens = writer.text.match(/"(?:\\.|[^"\\])*"|[{}()[\],|]|[^\s{}()[\],|"]+/gu);
  if (tokens && tokens.length > tokenLimit) input.fail('limit','Generated score exceeds '+tokenLimit+' target tokens. Select fewer measures or a larger capacity.',range);
  return { text: writer.text, source: {file: input.rootFile, part: first.part, measure: first.label, voices: staves[0].voices},
    staves, ...(input.options.sourceMap && { sourceMap: writer.map }) };
}
