// Resolve static lyric and harmony contexts against measured events after reading all parallel voices.
import type { Expression, Syllable } from './expression.js';
import { Input, Measure, type Event } from './score.js';
import type { Token } from './lilypond-source.js';
import { Time, zero } from './time.js';

/** A source may declare its lyric lane before the associated voice. */
export class Lanes {
  lyrics: { part?:string; target?:string; verse?:string; words:Token[]; token:Token }[] = [];
  chords: { at:Time; harmony:NonNullable<Expression['harmony']>; token:Token }[] = [];

  attach(staves: Measure[][], input:Input) {
    for (const lane of this.lyrics) {
      const candidates = staves.filter(bars=>!lane.part || bars[0].part===lane.part).flatMap(bars => [...new Set(bars.flatMap(b=>[...b.voices.keys()]))]
        .filter(name=>!lane.target || lane.target===name)
        .map(name=>bars.flatMap(b=>b.voices.get(name) ?? []).filter(e=>e.kind==='attack')));
      input.file=lane.token.file;
      if (candidates.length!==1) input.fail('unsupported','Expected one sung voice for this lyric context.',lane.token.range);
      this.underlay(candidates[0],lane.words,lane.verse,input);
    }
    if (!this.chords.length) return;
    const bars=staves[0];
    if (staves.length!==1) input.fail('unsupported','ChordNames requires an unambiguous anchor staff.',this.chords[0].token.range);
    const anchors=new Map<string,Event>();
    let start=zero;
    for (const bar of bars) {
      for (const events of bar.voices.values()) for (const event of events) {
        const at=start.plus(event.at), key=at.numerator+'/'+at.denominator;
        if (!anchors.has(key)) anchors.set(key,event);
      }
      start=start.plus(bar.pickup ?? bar.fragment ?? new Time(bar.beats,bar.beatType));
    }
    for (const {at,harmony,token} of this.chords) {
      input.file=token.file;
      const event=anchors.get(at.numerator+'/'+at.denominator);
      if (!event || event.expression?.harmony) input.fail('unsupported','ChordNames needs a distinct simultaneous event onset.',token.range);
      (event!.expression ??= {}).harmony=harmony;
    }
  }

  /** Continuing ties, slurs and manual beams produce native automatic melismas. */
  private underlay(events:Event[], words:Token[], verse:string|undefined, input:Input) {
    const anchors:number[]=[];
    const open=new Set<string>();
    for (const [i,event] of events.entries()) {
      const ties=event.headDetails?.every(h=>h.tieEndId);
      if (!ties && !event.tieStop && !open.size) anchors.push(i);
      for (const point of event.expression?.spans ?? []) if (point.kind==='slur' || point.kind==='beam') {
        if (point.edge==='start') open.add(point.id);
        else open.delete(point.id);
      }
    }
    let index=0, previous:Syllable|undefined, after=0;
    for (const token of words) {
      input.file=token.file;
      if (token.value==='--' || token.value==='__') {
        if (!previous) input.fail('syntax','Expected a syllable before a lyric connector.',token.range);
        if (token.value==='--') previous!.hyphen=true;
        else if (after) previous!.extend=after;
        continue;
      }
      const i=anchors[index++];
      if (i===undefined) input.fail('timing','More syllables than available sung attacks.',token.range);
      after=(anchors[index] ?? events.length)-i-1;
      if (token.value==='_') {previous=undefined;continue;}
      const val=token.value;
      if (!/^(?:[\p{L}\p{M}']+|"(?:[^"\\]|\\["\\])*")$/u.test(val))
        input.fail('unsupported','Expected a literal lyric syllable, skip, hyphen or extender.',token.range);
      previous={text:val.startsWith('"')?JSON.parse(val):val,verse};
      ((events[i].expression ??= {}).lyrics ??= []).push(previous);
    }
  }
}
