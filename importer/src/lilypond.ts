// Resolve static LilyPond music into measured voices without executing user code.
import { drumByName } from './lilypond-drums.js';
import { Lanes } from './lilypond-lanes.js';
import { afterNote, frets, headMark, standardGuitar, type Attachments } from './lilypond-marks.js';
import type { Guitar, HeadDetail, Instrument } from './expression.js';
import { includesExtended, convert, Input, keys, Measure, meter, minorKeys, pitch } from './score.js';
import type { Event, Pitch } from './score.js';
import { selectScore } from './lilypond-source.js';
import type { Expression, Scope, Token } from './lilypond-source.js';
import { Time, zero } from './time.js';
import type { ImportOptions, ImportResult, TextRange } from './types.js';
export type { ImportedDocument, ImportDiagnostic, ImportOptions, ImportResult, TextRange } from './types.js';
/** Selection is zero-based among all scores. Strings select the first matching output. */
export interface LilyPondOptions extends ImportOptions {
  includes?: Readonly<Record<string, string>>;
  score?: number | 'print' | 'midi';
  /** Retain a source's short final bar as an explicit VexTab fragment. */
  finalFragment?: boolean;
  /** Use sounding LilyPond guitar pitches and allocate strings for heads without an authored string. */
  guitar?: boolean | { capo?:number };
}

/** All duration fields are lexical. Variables carry their own duration defaults. */
interface Rhythm { denominator: number; dots: number }
interface State {
  marks:Attachments; instrument?:Instrument; headTies?:Map<string,string>;
  label?:string; slideFrom?:number; lastEvent?:Event; lastDetails?:HeadDetail[]; tieFrom?:Event; graceSlashed?:boolean;
  part: string; voice: string; group?: NonNullable<Measure['group']>; piano?: { id: string; hands: string[] }; display?: number; index: number; at: Time;
  mode: 'absolute' | 'relative' | 'fixed'; anchor: Pitch; fixed: number;
  rhythm: Rhythm; last: Pitch[]; tuplets: NonNullable<Event['tuplets']>;
  pendingGrace: Pitch[][]; collectGrace?: Pitch[][]; tie?: Pitch[]; uses: NonNullable<Event['uses']>;
}
const quarter = { denominator: 4, dots: 0 };
const letters = 'CDEFGAB';

/** Read a pitch name in the declared language, independently of the key signature. */
function readPitch(t: Token, state: State, language: string, input: Input): Pitch {
  let value = t.value;
  if (language === 'deutsch') {
    value = value.replace(/^b(?=[',]|$)/, 'bes').replace(/^h/, 'b');
  }
  if (language !== 'english') value = value.replace(/^as(?=[',]|$)/, 'aes').replace(/^es(?=[',]|$)/, 'ees');
  const match = /^([a-g])([a-z]*)(,*|'*)$/.exec(value);
  const signs: Record<string, number> = language === 'english' ? { '': 0, f: -1, ff: -2, s: 1, ss: 2 } :
    { '': 0, es: -1, eses: -2, is: 1, isis: 2 };
  if (!match || !Object.hasOwn(signs, match[2])) return input.fail('unsupported', 'Unknown ' + language + ' pitch ' + t.value + '.', t.range);
  const step = match[1].toUpperCase(), marks = match[3];
  let octave = state.mode === 'fixed' ? state.fixed : 3;
  if (state.mode === 'relative') {
    const delta = letters.indexOf(step) - letters.indexOf(state.anchor.step);
    octave = state.anchor.octave + (delta > 3 ? -1 : delta < -3 ? 1 : 0);
  }
  octave += marks.startsWith(',') ? -marks.length : marks.length;
  if (octave < 0 || octave > 9) return input.fail('unsupported', 'Pitch outside target octave range.', t.range);
  return pitch(step, signs[match[2]], octave);
}

/** Consume a duration, retaining the previous number and dots when both are omitted. */
function readRhythm(words: Token[], start: number, previous: Rhythm, input: Input): [Rhythm, number] {
  let i = start;
  if (!/^\d+$/.test(words[i]?.value ?? '')) return [previous, i];
  const token = words[i++];
  if (!/^(1|2|4|8|16|32|64|128|256)$/.test(token.value)) input.fail('unsupported', 'Unsupported written duration.', token.range);
  let dots = 0;
  while (words[i]?.value === '.') { dots++; i++; }
  if (dots > 2) input.fail('unsupported', 'At most two augmentation dots are supported.', token.range);
  return [{ denominator: Number(token.value), dots }, i];
}

/** Convert the written length and all enclosing tuplets to one exact elapsed fraction. */
function length(rhythm: Rhythm, tuplets: State['tuplets'] = []) {
  const factor = 2 ** rhythm.dots;
  let n = BigInt(factor * 2 - 1), d = BigInt(factor * rhythm.denominator);
  for (const t of tuplets) { n *= BigInt(t.normal); d *= BigInt(t.actual); }
  return new Time(n, d);
}

/** Resolve only the chosen movement, retaining distinct clocks for simultaneous music. */
class Resolver {
  private readonly parts = new Map<string, Measure[]>();
  private readonly lanes = new Lanes();
  private work = 0;
  private serial = 0;
  constructor(private readonly input: Input) {}

  /** Assign opening attributes from the preceding bar when first visiting a written measure. */
  private measure(s: State): Measure {
    if (s.index >= 4096) this.input.fail('limit', 'Exceeded 4,096 written bars.', [0, 0]);
    let bars = this.parts.get(s.part);
    if (!bars) this.parts.set(s.part, bars = []);
    if (!bars[s.index]) {
      const previous = bars[s.index - 1], bar = new Measure();
      if (previous) {
        bar.beats = previous.beats; bar.beatType = previous.beatType;
        bar.key = previous.key; bar.clef = previous.clef;
      }
      bar.part = s.piano?.id ?? s.part;
      bar.instrument = s.instrument;
      if (s.group) {
        bar.group = s.group;
        if (!s.group.parts.includes(bar.part)) s.group.parts.push(bar.part);
      }
      if (s.piano) {
        bar.piano = true;
        bar.staff = s.piano.hands.indexOf(s.part) + 1;
        if (!previous && bar.staff === 2) bar.clef = 'bass';
      }
      bar.label = String(s.index + 1);
      bars[s.index] = bar;
    }
    return bars[s.index];
  }

  /** Every indexed bar comes from an actual event or timing directive. Reject dangling attachments. */
  resolve(expr: Expression, finalFragment = false) {
    const guitar = (this.input.options as LilyPondOptions).guitar;
    let instrument:Guitar|undefined;
    if (guitar) {
      if (this.input.options.targetProfile!=='expressive') this.input.fail('unsupported','Guitar projection needs the expressive target.',[0,0]);
      instrument=standardGuitar();
      instrument.capo=typeof guitar==='object' ? guitar.capo ?? 0 : 0;
      if (!Number.isInteger(instrument.capo) || instrument.capo<0 || instrument.capo>24)
        this.input.fail('unsupported','Expected a capo fret from zero through 24.',[0,0]);
    }
    const state: State = { part: 'staff', voice: 'upper', index: 0, at: zero,
      mode: 'absolute', anchor: pitch('F', 0, 3), fixed: 3, rhythm: quarter,
      last: [], tuplets: [], pendingGrace: [], uses: [], marks:{spans:new Map()},
      instrument };
    this.sequence(expr.words, state, expr.scope, 0);
    if (state.pendingGrace.length || state.label!==undefined || state.slideFrom || state.tie || state.headTies?.size || state.marks.spans.size) this.input.fail('timing', 'Missing attachment target.', expr.words.at(-1)!.range);
    for (const bars of this.parts.values()) this.resolveAttributes(bars);
    if (finalFragment) for (const bars of this.parts.values()) {
      const last = bars[bars.length - 1];
      if (!last.pickup && last.extent.compare(zero) > 0 && last.extent.compare(new Time(last.beats, last.beatType)) < 0)
        last.fragment = last.extent;
    }
    this.lanes.attach([...this.parts.values()],this.input);
    return [...this.parts.values()].flat();
  }

  /** Resolve staff declarations after all voices have contributed their own source-time cursors. */
  private resolveAttributes(bars: Measure[]) {
    let key = 'C', clef = bars[0].clef, sounds = 0;
    for (const bar of bars) {
      const ordered = bar.changes.sort((a, b) => a.at.compare(b.at));
      const set = (change: Measure['changes'][number]) => {
        if (change.kind === 'key') key = String(change.value);
        if (change.kind === 'clef') clef = String(change.value);
        if (change.kind === 'sounds') sounds = Number(change.value);
      };
      for (const change of ordered) if (!change.at.compare(zero)) set(change);
      bar.key = key; bar.clef = clef; bar.sounds = sounds;
      bar.changes = ordered.filter(c => c.at.compare(zero) !== 0);
      for (const [voice, events] of bar.voices) {
        let i = 0;
        key = bar.key; sounds = bar.sounds;
        bar.voices.set(voice, events.map(event => {
          while (i < bar.changes.length && bar.changes[i].at.compare(event.at) <= 0) set(bar.changes[i++]);
          if (!sounds && !bar.changes.length) return event;
          const pitches = event.pitches?.map(p => ({ ...p, sounding: p.sounding + sounds }));
          if (pitches?.some(p => p.sounding < 0 || p.sounding > 127))
            this.input.fail('unsupported', 'Sounding instrument pitch outside MIDI range.', event.range);
          return { ...event, key, pitches, pitch: pitches?.[0] };
        }));
      }
      key = bar.key; clef = bar.clef; sounds = bar.sounds;
      bar.changes.forEach(set);
    }
  }

  /** Report the offending token in the original definition or virtual file. */
  private sequence(words: Token[], s: State, scope: Scope, depth: number) {
    for (let i = 0; i < words.length;) i = this.one(words, i, s, scope, depth);
  }

  /** Expressions consume their exact operands so neighboring simultaneous branches remain independent. */
  private one(words: Token[], index: number, s: State, scope: Scope, depth: number): number {
    let i = index;
    const t = words[i++], command = t.value, input = this.input;
    input.file = t.file;
    input.context = { part: s.part, measure: String(s.index + 1), voice: s.voice };
    if (depth > 64 || ++this.work > 65536) input.fail('limit', 'LilyPond expansion budget exceeded.', t.range);
    const next = () => words[i++] ?? input.fail('syntax', 'Missing argument to ' + command + '.', t.range);
    const child = () => {
      if (!words[i]) input.fail('syntax', 'Expected music after ' + command + '.', t.range);
      i = this.one(words, i, s, scope, depth + 1);
    };
    const boundary = () => {
      if (s.at.compare(zero)) input.fail('timing', 'Expected a measure boundary.', t.range);
    };
    switch (command) {
      case '{': this.sequence(t.children!, s, scope, depth + 1); break;
      case '<<': this.simultaneous(t, s, scope, depth); break;
      case '\\new': case '\\context': {
        const context = next().value;
        if (!['Staff', 'PianoStaff', 'StaffGroup', 'Voice', ...(input.options.targetProfile==='expressive'?['TabStaff','TabVoice','DrumStaff','DrumVoice','ChordNames','Lyrics']:[])].includes(context))
          input.fail('unsupported', 'Unsupported context ' + context + '.', t.range);
        const oldPart = s.part, oldVoice = s.voice, oldPiano = s.piano, oldDisplay = s.display, oldGroup = s.group, oldInstrument = s.instrument;
        let id: string | undefined;
        if (words[i]?.value === '=') {
          i++; const label = next();
          if (!/^"[^"\\]+"$|^[A-Za-z]+$/.test(label.value)) input.fail('syntax', 'Expected a literal context ID.', label.range);
          id = label.value.replace(/^"|"$/g, '');
        }
        if (context==='Lyrics' || context==='ChordNames') {
          const mode=context==='Lyrics'?'\\lyricmode':'\\chordmode';
          let target:string|undefined;
          if (context==='Lyrics' && words[i]?.value==='\\lyricsto') {
            i++; target=next().value.replace(/^"|"$/g,'');
          }
          if (words[i]?.value===mode) i++;
          const lane=this.laneGroup(next(),scope,mode);
          if (context==='Lyrics') this.lanes.lyrics.push({target,verse:id,words:lane.words,token:t});
          else this.chordNames(lane.words,s,lane.scope.language,t);
          break;
        }
        if (context === 'PianoStaff') {
          const group = words[i];
          if (group?.value !== '<<') input.fail('unsupported', 'Expected two simultaneous piano staves.', t.range);
          const branches = group.children!, hands: string[] = [];
          for (const [j, branch] of branches.entries()) {
            if (!['\\context', '\\new'].includes(branch.value) || branches[j + 1]?.value !== 'Staff') continue;
            if (branches[j + 2]?.value !== '=') input.fail('unsupported', 'Expected a named piano staff.', branch.range);
            hands.push(branches[j + 3]?.value.replace(/^"|"$/g, ''));
          }
          if (hands.length !== 2 || hands[0] === hands[1]) input.fail('unsupported', 'Expected two distinct piano hands.', t.range);
          s.piano = { id: id ?? 'piano' + ++this.serial, hands };
        }
        if (context === 'StaffGroup') {
          if (!includesExtended(input.options)) input.omit('Staff-group bracket omitted.', t.range);
          else if (s.group) input.fail('unsupported', 'Nested staff groups require a richer target profile.', t.range);
          else s.group = { symbol: 'bracket', parts: [] };
        }
        if (context === 'TabStaff') s.instrument={...(s.instrument?.kind==='guitar'?s.instrument:standardGuitar()),view:'tab'};
        if (context === 'DrumStaff') s.instrument={kind:'drums',map:[]};
        if (context === 'Staff' || context === 'TabStaff' || context === 'DrumStaff') s.part = id ?? (s.part === 'staff' && !this.parts.has('staff') ? 'staff' : 'staff' + ++this.serial);
        if (['Voice','TabVoice','DrumVoice'].includes(context) && id) s.voice = id;
        if (words[i]?.value==='\\with') {
          i++;
          const settings=next();
          if (settings.value!=='{') input.fail('syntax','Expected a context property block.',settings.range);
          const consumed=this.stringTuning(settings.children!,s,scope.language,settings);
          if (consumed!==settings.children!.length) input.fail('unsupported','Unexpected extra context settings.',settings.range);
        }
        child();
        while (words[i]?.value==='\\addlyrics') i=this.one(words,i,s,scope,depth+1);
        s.part = oldPart; s.voice = oldVoice; s.piano = oldPiano; s.display = oldDisplay; s.group = oldGroup; s.instrument = oldInstrument;
        break;
      }
      case '\\addlyrics': {
        if (input.options.targetProfile!=='expressive') input.fail('unsupported','Lyrics need the expressive target.',t.range);
        const lane=this.laneGroup(next(),scope,'\\lyricmode');
        const target=this.parts.get(s.part)?.some(b=>b.voices.has(s.voice)) ? s.voice : undefined;
        this.lanes.lyrics.push({part:s.piano?.id ?? s.part,target,verse:'lyrics'+ ++this.serial,words:lane.words,token:t});
        break;
      }
      case '\\drummode': {
        if (input.options.targetProfile!=='expressive') input.fail('unsupported','Drum mode needs the expressive target.',t.range);
        if (!s.instrument) s.instrument={kind:'drums',map:[]};
        if (s.instrument.kind!=='drums') input.fail('unsupported','Cannot mix pitched and drum music in one staff.',t.range);
        child(); break;
      }
      case '\\change': {
        if (next().value !== 'Staff' || next().value !== '=') input.fail('unsupported', 'Expected a staff change.', t.range);
        const name = next().value.replace(/^"|"$/g, '');
        if (!s.piano || !s.piano.hands.includes(name)) input.fail('unsupported', 'Unknown display staff ' + name + '.', t.range);
        s.display = s.piano!.hands.indexOf(name) + 1;
        break;
      }
      case '\\relative': case '\\absolute': case '\\fixed': {
        const old = { mode: s.mode, fixed: s.fixed, anchor: s.anchor };
        s.mode = 'absolute';
        let reference = pitch('F', 0, 3);
        if (command === '\\fixed' || (command === '\\relative' && /^[a-z]/.test(words[i]?.value ?? '')))
          reference = readPitch(next(), s, scope.language, input);
        s.mode = command === '\\relative' ? 'relative' : command === '\\fixed' ? 'fixed' : 'absolute';
        s.anchor = reference; s.fixed = reference.octave;
        child();
        Object.assign(s, old);
        break;
      }
      case '\\time': {
        boundary();
        const ratio = next(), [a, b] = ratio.value.split('/');
        meter(a, b, this.measure(s), input, ratio.range);
        break;
      }
      case '\\key': {
        if (s.at.compare(zero) && !includesExtended(input.options))
          input.fail('unsupported', 'Inline key changes need the extended target.', t.range);
        const p = readPitch(next(), { ...s, mode: 'absolute' }, scope.language, input);
        const tonic = p.step + ['bb', 'b', '', '#', '##'][p.alter + 2];
        const mode = next().value;
        const key = mode === '\\major' && keys.includes(tonic) ? tonic :
          mode === '\\minor' && minorKeys.includes(tonic + 'm') ? tonic + 'm' : undefined;
        if (!key) return input.fail('unsupported', 'Unqualified key signature.', t.range);
        this.measure(s).changes.push({kind:'key', at:s.at, value:key, range:t.range});
        break;
      }
      case '\\clef': {
        if (s.at.compare(zero) && !includesExtended(input.options))
          input.fail('unsupported', 'Inline clef changes need the extended target.', t.range);
        let clef = next().value.replace(/^"|"$/g, '');
        if (s.instrument?.kind==='guitar' && (clef==='treble_8' || clef==='moderntab')) clef='treble';
        if (!['treble', 'bass', 'alto', 'tenor'].includes(clef)) input.fail('unsupported', 'Unsupported clef.', t.range);
        this.measure(s).changes.push({kind:'clef', at:s.at, value:clef, range:t.range});
        break;
      }
      case '\\transposition': {
        const tone = readPitch(next(), { ...s, mode: 'absolute' }, scope.language, input);
        if (!includesExtended(input.options)) input.fail('unsupported', 'Instrument transposition needs the extended target.', t.range);
        this.measure(s).changes.push({kind:'sounds', at:s.at, value:tone.sounding - 60, range:t.range});
        break;
      }
      case '\\tempo': {
        if (!includesExtended(input.options)) input.fail('unsupported', 'Tempo changes need the extended target.', t.range);
        if (words[i]?.value.startsWith('"') && input.options.targetProfile==='expressive') {
          const label=words[i++];
          if (s.label!==undefined || !/^"(?:[^"\\]|\\["\\])*"$/.test(label.value))
            input.fail('unsupported','Expected one literal tempo heading.',label.range);
          s.label=JSON.parse(label.value);
          if (!/^\d+$/.test(words[i]?.value ?? '')) break;
        }
        if (!/^\d+$/.test(words[i]?.value ?? '')) input.fail('unsupported', 'Expected a metronome beat unit.', t.range);
        const [unit, end] = readRhythm(words, i, quarter, input);
        i = end;
        if (next().value !== '=') input.fail('syntax', 'Expected a metronome assignment.', t.range);
        const number = next(), duration = length(unit);
        const bpm = Number(number.value) * 4 * Number(duration.numerator) / Number(duration.denominator);
        if (!/^\d+$/.test(number.value) || !Number.isInteger(bpm) || bpm < 1 || bpm > 999)
          input.fail('unsupported', 'Expected a representable positive quarter-note BPM.', number.range);
        this.measure(s).tempos.push({bpm, at:s.at, range:t.range});
        break;
      }
      case '\\stemUp': case '\\stemDown': case '\\stemNeutral':
      case '\\voiceOne': case '\\voiceTwo': case '\\voiceThree': case '\\voiceFour':
      case '\\slurUp': case '\\slurDown': case '\\tieDown':
      case '\\mergeDifferentlyHeadedOn': case '\\mergeDifferentlyDottedOn':
        if (input.options.targetProfile !== 'expressive') input.fail('unsupported','Source engraving directive outside this profile.',t.range);
        if (command==='\\slurUp' || command==='\\slurDown') s.marks.side=command==='\\slurUp'?'above':'below';
        else input.omit('Source engraving directive '+command+' omitted.',t.range);
        break;
      case '\\override': {
        const signature=['TextScript','#',"'",'padding','=','#','2'];
        if (input.options.targetProfile !== 'expressive' || signature.some((v,k)=>words[i+k]?.value!==v))
          input.fail('unsupported','Unknown property override.',t.range);
        i+=signature.length;
        input.omit('Legacy text-script padding omitted.',[t.range[0],words[i-1].range[1]]);
        break;
      }
      case '\\set': {
        const prop=next();
        if (s.instrument?.kind==='guitar' && ['TabStaff','Staff','stringTunings'].includes(prop.value)) {
          i=index+1+this.stringTuning(words.slice(index+1),s,scope.language,prop);
          break;
        }
        if (input.options.targetProfile!=='expressive' || next().value!=='=') input.fail('unsupported','Unknown setting.',prop.range);
        if (prop.value==='fingeringOrientations') {
          for (const literal of ['#',"'",'(']) if (next().value!==literal) input.fail('unsupported','Expected literal finger orientation.',prop.range);
          const direction=next().value;
          if (!['up','down','left','right'].includes(direction) || next().value!==')') input.fail('unsupported','Unknown finger orientation.',prop.range);
          s.marks.fingerSide=direction==='up'?'above':direction==='down'?'below':direction as 'left'|'right';
        } else input.fail('unsupported','Unsupported setting '+prop.value+'.',prop.range);
        break;
      }
      case '\\partial': {
        boundary();
        if (s.index || !/^\d+$/.test(words[i]?.value ?? '')) input.fail('timing', 'Expected an opening pickup duration.', t.range);
        const [duration, end] = readRhythm(words, i, quarter, input);
        this.measure(s).pickup = length(duration); i = end;
        break;
      }
      case '|': boundary(); break;
      case '\\tuplet': case '\\times': {
        const ratio = next(), match = /^([1-9]\d?)\/([1-9]\d?)$/.exec(ratio.value);
        if (!match || +match[1] > 16 || +match[2] > 16 || s.tuplets.length >= 8)
          return input.fail('unsupported', 'Unsupported tuplet ratio or nesting.', ratio.range);
        const reverse = command === '\\times';
        s.tuplets = [...s.tuplets, { actual: +match[reverse ? 2 : 1], normal: +match[reverse ? 1 : 2], id: 't' + ++this.serial }];
        child();
        s.tuplets = s.tuplets.slice(0, -1);
        break;
      }
      case '\\afterGrace': {
        if (input.options.targetProfile!=='expressive') input.fail('unsupported','After-grace needs the expressive target.',t.range);
        let share=new Time(1,4);
        if (/^\d+\/\d+$/.test(words[i]?.value ?? '')) {
          const ratio=next(), [n,d]=ratio.value.split('/').map(Number);
          if (!Number.isSafeInteger(d) || d>1024 || n<=0 || n>=d) input.fail('unsupported','Invalid after-grace fraction.',ratio.range);
          share=new Time(d-n,d);
        }
        const previous=s.lastEvent;
        child();
        const main=s.lastEvent;
        if (!main || main===previous || main.grace || main.kind!=='attack') input.fail('unsupported','Expected one pitched after-grace anchor.',t.range);
        const rhythm=s.rhythm;
        s.collectGrace=[];
        child();
        if (!s.collectGrace.length) input.fail('syntax','Expected grace notes.',t.range);
        main!.grace=s.collectGrace;
        const expression=main!.expression ??= {};
        expression.graceSide='after'; expression.graceSteal=share;
        delete s.collectGrace; s.rhythm=rhythm;
        break;
      }
      case '\\acciaccatura': case '\\appoggiatura': case '\\grace': {
        if (command !== '\\grace' && input.options.targetProfile!=='expressive') input.fail('unsupported','Grace style requires the expressive target.',t.range);
        s.graceSlashed=command==='\\acciaccatura';
        if (s.collectGrace || s.pendingGrace.length) input.fail('unsupported', 'Nested grace groups.', t.range);
        s.collectGrace = s.pendingGrace;
        const previousRhythm=s.rhythm;
        child();
        s.rhythm=previousRhythm;
        delete s.collectGrace;
        break;
      }
      case '\\unfoldRepeats': case '\\applyMusic': {
        if (command === '\\applyMusic') {
          // Mutopia's 2.14 edition spells this one built-in as a Scheme identifier.
          for (const literal of ['#', 'unfold', '-', 'repeats']) {
            if (words[i]?.value !== literal) input.fail('unsupported', 'Unknown music transformation.', t.range);
            i++;
          }
        }
        boundary();
        const start = s.index;
        child();
        boundary();
        this.unfoldBars(s, start, t);
        break;
      }
      case '\\repeat': return this.repeat(words, i, s, scope, depth, t);
      default: {
        if (command.startsWith('\\')) {
          let binding: Scope | undefined = scope;
          while (binding && binding.name !== command.slice(1)) binding = binding.previous;
          if (!binding?.value) return input.fail('unsupported', 'Cannot resolve music command ' + command + '.', t.range);
          const rhythm = s.rhythm;
          s.uses.push({ file: t.file, range: t.range });
          s.rhythm = quarter;
          this.sequence(binding.value.words, s, binding.value.scope, depth + 1);
          s.uses.pop(); s.rhythm = rhythm;
        } else return this.note(words, index, s, scope.language);
      }
    }
    return i;
  }

  /** Resolve a static lane variable in its lexical scope without interpreting other music modes. */
  private laneGroup(token:Token, scope:Scope, mode:string) {
    for (let level=0;level<64;level++) {
      if (token.value==='{') return {words:token.children!,scope};
      let binding:Scope|undefined=scope;
      while (binding && '\\'+binding.name!==token.value) binding=binding.previous;
      if (!binding?.value) break;
      const value=binding.value, words=value.words[0]?.value===mode ? value.words.slice(1) : value.words;
      if (words.length!==1) break;
      token=words[0]; scope=value.scope;
    }
    return this.input.fail('unsupported','Expected a static '+mode+' group.',token.range);
  }

  /** ChordNames is a display lane. Its durations select anchor events without adding sounded pitches. */
  private chordNames(words:Token[], s:State, language:string, source:Token) {
    if (s.index || s.at.compare(zero)) this.input.fail('unsupported','Expected a chord lane at score start.',source.range);
    let at=zero, rhythm=quarter;
    const pitchName=(token:Token) => {
      if (!token) this.input.fail('syntax','Missing chord root or bass.',source.range);
      const p=readPitch(token,{...s,mode:'absolute'},language,this.input);
      return p.step+['bb','b','','#','##'][p.alter+2];
    };
    for (let i=0;i<words.length;) {
      const t=words[i++];
      if (t.value==='|') continue;
      const skip=t.value==='s' || t.value==='r', root=skip?'':pitchName(t);
      [rhythm,i]=readRhythm(words,i,rhythm,this.input);
      let quality='', bass:string|undefined;
      if (words[i]?.value===':') {
        const colon=words[i++];
        let end=colon.range[1];
        while (words[i]?.range[0]===end && /^[a-zA-Z0-9]+$/.test(words[i].value)) {
          quality+=words[i].value; end=words[i++].range[1];
        }
        if (!/^(?:m|maj|aug|dim|sus)?(?:2|4|6|7|9|11|13)?$/.test(quality))
          this.input.fail('unsupported','Unsupported chord quality '+quality+'.',colon.range);
      }
      if (words[i]?.value==='/') {i++;bass=pitchName(words[i++]);}
      if (!skip) this.lanes.chords.push({at,harmony:{root,quality,bass},token:t});
      at=at.plus(length(rhythm));
    }
  }

  /** StringTuning takes an absolute, low-to-high pitch chord. Only named built-ins and literal data are read. */
  private stringTuning(words:Token[], s:State, lang:string, t:Token) {
    const input=this.input;
    let i=0;
    if (words[i]?.value==='TabStaff' || words[i]?.value==='Staff') {
      if (words[++i]?.value!=='.') input.fail('unsupported','Expected stringTunings.',t.range);
      i++;
    }
    if (s.instrument?.kind!=='guitar' || s.at.compare(zero) || s.index || words[i++]?.value!=='stringTunings' || words[i++]?.value!=='=')
      return input.fail('unsupported','Expected static guitar stringTunings at the start of a staff.',t.range);
    let tones:Token[];
    if (words[i]?.value==='\\stringTuning' && words[i+1]?.value==='<') {
      tones=words[i+1].children!; i+=2;
    } else {
      if (words[i++]?.value!=='#') return input.fail('unsupported','Expected a literal or built-in string tuning.',t.range);
      const first=i++;
      while (words[i]?.value==='-' && words[i+1]?.value.match(/^[a-z]+$/)) i+=2;
      const name=words.slice(first,i).map(w=>w.value).join('');
      const pitches:Record<string,string>={'guitar-tuning':"e, a, d g b e'",'guitar-drop-d-tuning':"d, a, d g b e'",
        'guitar-open-g-tuning':"d, g, d g b d'",'guitar-dadgad-tuning':"d, a, d g a d'"};
      if (!Object.hasOwn(pitches,name)) input.fail('unsupported','Unknown string tuning '+name+'.',t.range);
      tones=pitches[name].split(' ').map(value=>({...t,value})); lang='nederlands';
    }
    if (tones.length<4 || tones.length>8) input.fail('unsupported','Expected four to eight guitar strings.',t.range);
    s.instrument.tuning=tones.map(token=>readPitch(token,{...s,mode:'absolute'},lang,input)).reverse();
    return i;
  }

  /** Time branches from one origin. LilyPond resolves relative pitch and inherited duration in source order. */
  private simultaneous(token: Token, s: State, scope: Scope, depth: number) {
    const words = token.children!;
    let longest: State = { ...s }, branch = 0;
    for (let i = 0; i < words.length;) {
      if (words[i].value === '\\\\') this.input.fail('syntax', 'Missing simultaneous branch.', words[i].range);
      const v: State = { ...s, voice: branch === 0 ? s.voice : branch === 1 ? 'lower' : 'voice' + (branch + 1),
        pendingGrace: [], tie: undefined, tieFrom:undefined, headTies:undefined, marks:{...s.marks,spans:new Map()} };
      i = this.one(words, i, v, scope, depth + 1);
      if (v.tie || v.label!==undefined || v.slideFrom || v.pendingGrace.length || v.headTies?.size || v.marks.spans.size) this.input.fail('unsupported', 'Dangling branch attachment.', token.range);
      s.rhythm = v.rhythm; s.anchor = v.anchor; s.last = v.last;
      if (v.index > longest.index || (v.index === longest.index && v.at.compare(longest.at) > 0)) longest = v;
      if (words[i]?.value === '\\\\') {
        if (++i === words.length) this.input.fail('syntax', 'Missing simultaneous branch.', token.range);
      }
      branch++;
    }
    s.index = longest.index; s.at = longest.at;
  }

  /** Expand already-resolved written bars, preserving relative pitch and pass-specific endings. */
  private unfoldBars(s: State, start: number, token: Token) {
    const bars = this.parts.get(s.part);
    if (!bars || bars.length !== s.index || start >= s.index)
      this.input.fail('unsupported', 'Unfolding requires complete bars in one staff.', token.range);
    const out: Measure[] = [];
    const ids=new Map<string,string>();
    const startId=(old:string) => {
      const fresh='u'+ ++this.serial; ids.set(old,fresh); return fresh;
    };
    const endId=(old:string) => {
      const fresh=ids.get(old);
      if (!fresh) return this.input.fail('unsupported','Unfolded endpoint has no performed start.',token.range);
      ids.delete(old); return fresh;
    };
    const append = (bar: Measure, pass=0) => {
      this.work += [...bar.voices.values()].reduce((n, events) => n + events.length, 0);
      if (out.length >= 4096 || this.work > 65536) this.input.fail('limit', 'Unfolded music exceeds budget.', token.range);
      const copy = Object.assign(new Measure(), bar, { label: String(start + out.length + 1) });
      copy.voices=new Map([...bar.voices].map(([voice,events])=>[voice,events.map(event=>{
        const headDetails=event.headDetails?.map(h=>({...h,
          tieEndId:h.tieEndId && endId(h.tieEndId), tieStartId:h.tieStartId && startId(h.tieStartId)}));
        const expression=event.expression && {...event.expression};
        if (expression?.spans) expression.spans=expression.spans.map(p=>({...p,id:p.edge==='start'?startId(p.id):endId(p.id)}));
        return {...event,headDetails,expression,tuplets:event.tuplets?.map(group=>({...group,id:group.id+'-'+pass}))};
      })]));
      delete copy.repeatStart; delete copy.repeatEnd; delete copy.ending; delete copy.endingEnd;
      out.push(copy);
    };
    let i = start;
    while (i < bars.length) {
      const count = bars[i].repeatStart;
      if (!count) { append(bars[i++]); continue; }
      const body = i;
      while (i < bars.length && !bars[i].repeatEnd) i++;
      if (i === bars.length) this.input.fail('unsupported', 'Unclosed written repeat.', token.range);
      const end = ++i, choices: Measure[][] = [];
      while (bars[i]?.ending) {
        const from = i;
        while (i < bars.length && !bars[i].endingEnd) i++;
        if (i === bars.length) this.input.fail('unsupported', 'Unclosed written ending.', token.range);
        choices.push(bars.slice(from, ++i));
      }
      for (let pass = 0; pass < count; pass++) {
        for (let j = body; j < end; j++) append(bars[j],pass);
        for (const bar of choices[pass] ?? []) append(bar,pass);
      }
    }
    bars.splice(start, bars.length - start, ...out);
    s.index = bars.length;
  }

  /** Represent written volta bars once. Unfold repeats replay the resolved music with bounded work. */
  private repeat(words: Token[], i: number, s: State, scope: Scope, depth: number, t: Token): number {
    const style = words[i++]?.value, n = words[i++]?.value, input = this.input;
    if (!n || !/^(?:[1-9]|[12]\d|3[0-2])$/.test(n) || !['volta', 'unfold'].includes(style))
      return input.fail('unsupported', 'Expected a literal bounded volta or unfold repeat.', t.range);
    const first = i, start = s.index, relative = s.anchor, rhythm = s.rhythm;
    if (!words[first]) return input.fail('syntax', 'Missing repeat body.', t.range);
    if (style === 'unfold') {
      for (let pass = 0; pass < +n; pass++) {
        s.anchor = relative; s.rhythm = rhythm;
        i = this.one(words, first, s, scope, depth + 1);
      }
      return i;
    }
    if (s.at.compare(zero)) input.fail('unsupported', 'Volta must start on a written boundary.', t.range);
    this.measure(s).repeatStart = +n;
    const contents = words[first].children;
    let choices: Token | undefined;
    if (contents && contents.at(-2)?.value === '\\alternative') {
      choices = contents.at(-1);
      this.sequence(contents.slice(0, -2), s, scope, depth + 1);
      i = first + 1;
    } else i = this.one(words, first, s, scope, depth + 1);
    if (s.index === start || s.at.compare(zero)) input.fail('unsupported', 'Volta must end on a written boundary.', t.range);
    this.parts.get(s.part)![s.index - 1].repeatEnd = true;
    if (words[i]?.value === '\\alternative') {
      if (choices) input.fail('unsupported', 'Duplicate alternative blocks.', t.range);
      choices = words[++i]; i++;
    }
    if (choices) {
      if (choices.value !== '{') input.fail('syntax', 'Expected a group of alternatives.', choices.range);
      const items = choices.children!, endings: Token[] = [];
      for (let k = 0; k < items.length;) {
        if (items[k].value === '\\volta') {
          k++;
          const pass = items[k++];
          if (pass?.value !== String(endings.length + 1) || items[k]?.value === ',')
            input.fail('unsupported', 'Expected one consecutive pass number per written ending.', pass?.range ?? choices.range);
        }
        const item = items[k++];
        if (!item) input.fail('syntax', 'Missing alternative music.', choices.range);
        if (item.value === '{') endings.push(item);
        else {
          const [ , end] = readRhythm(items, k, s.rhythm, input);
          endings.push({ ...item, value: '{', children: items.slice(k - 1, end) });
          k = end;
        }
      }
      if (endings.length !== +n) input.fail('unsupported', 'Expected one ending per pass.', choices.range);
      for (const [j, ending] of endings.entries()) {
        const before = s.index;
        this.measure(s).ending = j + 1;
        this.sequence(ending.children!, s, scope, depth + 1);
        if (s.index === before || s.at.compare(zero)) input.fail('unsupported', 'Ending must fill written bars.', ending.range);
        this.parts.get(s.part)![s.index - 1].endingEnd = true;
      }
    }
    return i;
  }

  /** Resolve chord heads in order, then restore the first head as the next relative reference. */
  private note(words: Token[], i: number, s: State, language: string) {
    const t = words[i], input = this.input;
    const expressive=input.options.targetProfile==='expressive', details: HeadDetail[]=[];
    const tiedHeads: number[]=[], headRanges:TextRange[]=[];
    let heads: Pitch[] = [], kind: Event['kind'] = 'attack';
    if (/^\d+$/.test(t.value) || t.value === 'q') {
      if (!s.last.length) input.fail('unsupported', 'Repeated pitch has no preceding attack.', t.range);
      heads = s.last;
      for (const h of s.lastDetails ?? []) details.push({drum:h.drum,string:h.string});
      if (t.value === 'q') i++;
    } else {
      i++;
      if (t.value === 'r' || t.value === 'R') kind = 'rest';
      else if (t.value === 's') kind = 'skip';
      else {
        const notes = t.value === '<' ? t.children! : [t];
        if (!notes.length) input.fail('syntax','Empty chord.',t.range);
        for (let j=0;j<notes.length;) {
          const item=notes[j++], detail:HeadDetail={};
          let p:Pitch;
          if (s.instrument?.kind==='drums') {
            const drum=drumByName(item.value);
            if (!drum) return input.fail('unsupported','Unsupported LilyPond drum '+item.value+'.',item.range);
            if (!s.instrument.map.some(d=>d.id===drum.id)) s.instrument.map.push(drum);
            if (drum.id==='closedhihat' || drum.id==='openhihat') input.omit(drum.id+' playing sign omitted.',item.range);
            p={...pitch('C',0,4),sounding:drum.midi}; detail.drum=drum.id;
          } else p=readPitch(item,s,language,input);
          if (heads.length>=16) input.fail('limit','Chord exceeds 16 heads.',item.range);
          heads.push(p); details.push(detail); headRanges.push(item.range); s.anchor=p;
          if (expressive && t.value==='<') {
            for (;;) {
              if (notes[j]?.value==='~') { tiedHeads.push(heads.length-1); j++; continue; }
              const end=headMark(notes,j,detail,s.marks.fingerSide,input);
              if (end===j) break;
              j=end;
            }
          }
        }
        s.anchor = heads[0];
      }
    }
    while (details.length<heads.length) details.push({});
    if (expressive && heads.length===1) {
      const j=headMark(words,i,details[0],s.marks.fingerSide,input);
      if (j!==i) i=j;
    }
    const [rhythm, end] = readRhythm(words, i, s.rhythm, input);
    s.rhythm = rhythm; i = end;
    const range: TextRange = [t.range[0], words[i - 1].range[1]];
    if (s.collectGrace) {
      if (!heads.length || s.collectGrace.length >= 16) input.fail('unsupported', 'Unsupported grace event.', range);
      // The target grace spelling carries ordered heads but does not retain a written duration.
      if (rhythm.denominator !== 8 || rhythm.dots) input.omit('Grace duration is normalized to an eighth.', range);
      s.collectGrace.push(heads);
      s.last = heads;
      return i;
    }
    const bar = this.measure(s), elapsed = length(rhythm, s.tuplets);
    const endTime = s.at.plus(elapsed), barLength = bar.pickup ?? new Time(bar.beats, bar.beatType);
    if (endTime.compare(barLength) > 0) return input.fail('timing', 'Event crosses a bar without a written tie.', range);
    if (t.value === 'R' && (s.at.compare(zero) || elapsed.compare(barLength)))
      input.fail('unsupported', 'A full-measure rest must occupy a complete bar.', range);
    const event: Event = { kind, at: s.at, elapsed, ...rhythm, staff: s.display ?? bar.staff, pitch: heads[0], pitches: heads,
      range, file: t.file, uses: [...s.uses], tuplets: s.tuplets };
    if (s.pendingGrace.length) {
      if (!heads.length) input.fail('unsupported', 'Expected a pitched grace anchor.', range);
      event.grace = s.pendingGrace;
      if (expressive && s.graceSlashed) event.expression={graceSlashed:true};
      s.graceSlashed=false; s.pendingGrace = [];
    }
    if (expressive) {
      const spelling=(p:Pitch)=>p.step+'/'+p.alter+'/'+p.octave;
      if (s.headTies) {
        for (const [name,id] of s.headTies) {
          const j=heads.findIndex(p=>spelling(p)===name);
          if (j<0) input.fail('timing','Missing tied destination '+name+'.',range);
          details[j].tieEndId=id;
        }
        delete s.headTies;
      }
      if (s.tie && s.tieFrom) {
        let count=0;
        for (const [j,old] of s.tie.entries()) {
          const dest=heads.findIndex(p=>spelling(p)===spelling(old));
          if (dest<0) continue;
          const id='tie'+ ++this.serial;
          s.tieFrom.headDetails![j].tieStartId=id; details[dest].tieEndId=id; count++;
        }
        if (!count) input.fail('timing','No matching destination for a tie.',range);
        delete s.tie; delete s.tieFrom;
      }
      for (const j of tiedHeads) {
        const id='tie'+ ++this.serial;
        (s.headTies ??= new Map()).set(spelling(heads[j]),id);
        details[j].tieStartId=id;
      }
      event.headDetails=details;
      if (s.label!==undefined) { (event.expression ??= {}).label=s.label; delete s.label; }
      if (t.value==='<') event.headRanges=headRanges;
      const previousSlide=s.slideFrom;
      delete s.slideFrom;
      let slide=false;
      for (;;) {
        if (words[i]?.value==='\\glissando') {
          if (s.instrument?.kind!=='guitar' || heads.length!==1) input.fail('unsupported','A guitar slide requires a single fretted head.',words[i].range);
          slide=true; i++; continue;
        }
        if (words[i]?.value==='~') {
          if (!heads.length) input.fail('syntax','Cannot tie silence.',range);
          s.tie=heads; s.tieFrom=event; i++; continue;
        }
        const headEnd=heads.length===1?headMark(words,i,details[0],s.marks.fingerSide,input):i;
        if (headEnd!==i) {i=headEnd;continue;}
        const end=afterNote(words,i,event,s.marks,input,()=> 's'+ ++this.serial);
        if (end===i) break;
        i=end;
      }
      event.range=[t.range[0],words[i-1].range[1]];
      if (s.instrument?.kind==='guitar') {
        if (previousSlide) {
          if (heads.length!==1 || details[0].string && details[0].string!==previousSlide)
            input.fail('unsupported','Slide destination must use the same string.',t.range);
          details[0].string=previousSlide; details[0].gesture='slide';
        }
        frets(heads,details,s.instrument,input,t);
        if (slide) s.slideFrom=details[0].string;
        event.pitches=heads.map(p=>({...p,octave:p.octave+1}));
        event.pitch=event.pitches[0];
        if (event.grace) event.grace=event.grace.map(chord=>chord.map(p=>({...p,octave:p.octave+1})));
      }
    } else {
      if (s.tie) {
        if (heads.length !== s.tie.length || s.tie.some((p, j) => p.step !== heads[j].step ||
          p.alter !== heads[j].alter || p.octave !== heads[j].octave)) input.fail('unsupported', 'Only matching whole-event ties are qualified.', range);
        event.tieStop = true; delete s.tie;
      }
      if (words[i]?.value === '~') {
        if (!heads.length) input.fail('syntax', 'Cannot tie a silent event.', range);
        s.tie = heads; event.tieStart = true; i++;
      }
      if (words[i]?.value === '-.') input.omitMark(words[i++].range);
      if (/^\\(?:p{1,4}|f{1,4}|mp|mf)$/.test(words[i]?.value ?? '')) {
        const mark = words[i++];
        input.omit('Dynamic ' + mark.value + ' omitted.', mark.range);
      }
    }
    bar.add(s.voice, event, input);
    s.last = heads; s.lastDetails=details; s.lastEvent=event;
    if (endTime.compare(barLength) === 0) { s.index++; s.at = zero; } else s.at = endTime;
    return i;
  }
}

/** Convert a selected static movement. Embedded Scheme and external file access are never executed. */
export function importLilyPond(source: string, options: LilyPondOptions = {}): ImportResult {
  return convert(options, 'score.ly', input => {
    const file = input.file;
    const bars = new Resolver(input).resolve(selectScore(source, options, input), options.finalFragment);
    input.file = file;
    return [bars, [0, source.length]];
  });
}
