// Lesson copy and routing metadata. Each playable source lives in guide/scores.
import first from './scores/first-fret.vextab';
import triplets from './scores/triplets.vextab';
import meter from './scores/meter.vextab';
import articulations from './scores/articulations.vextab';
import gestures from './scores/guitar-gestures.vextab';
import tied from './scores/tied-chord.vextab';
import errors from './scores/diagnostics.vextab';
import picking from './scores/compound-picking.vextab';
import workshop from './scores/chord-workshop.vextab';
import bossa from './scores/bossa.vextab';
import drop from './scores/drop-d-turnaround.vextab';
import river from './scores/slow-river.vextab';
import repeats from './scores/repeat-endings.vextab';
import duet from './scores/guitar-duet.vextab';
import workbench from './scores/embed-workbench.vextab';
import sor from './scores/sor-op35-no22.vextab';
import joplin from './scores/joplin-maple-leaf.vextab';
import handy from './scores/handy-st-louis-blues.vextab';
import haydn from './scores/haydn-emperor-variation.vextab';
import type { Part } from '../src/score/layout';

export interface Lesson {
  id: string;
  title: string;
  source: string;
  goal: string;
  edit: string;
  views: Part[];
  edition?: { credit: string; url: string };
  fixed?: boolean;
  demo?: boolean;
}

const guitar: Part[] = ['score', 'notation', 'tab'];
const staff: Part[] = ['notation'];

/** The guide and playground share stable IDs. The demo index lists the complete pieces. */
export const lessons: Lesson[] = [
  { id:'first-fret', title:'Your first fret', source:first, views:guitar,
    goal:'Read four quarter notes on the first string. The open string sounds E. Each fret raises it one semitone.',
    edit:'Change 3 to 5. The third note rises from G to A. Switch between paired, notation and tab views and find it in each.' },
  { id:'meter', title:'Count three or count two', source:meter, views:staff,
    goal:'Six eighths fill both measures. In 3/4 the beams show three pairs. In 6/8 they show two groups of three.',
    edit:'Change the second time signature to 3/4. Compare the beams. Try Eb4 instead of E4 to write E flat.' },
  { id:'triplets', title:'Hear a triplet', source:triplets, views:guitar,
    goal:'Three eighth-note frets occupy beat one. The quarter lands on beat two.',
    edit:'Switch to Tab and change the second fret. Remove the tuplet wrapper to see why the written durations now exceed 2/4.' },
  { id:'guitar-gestures', title:'Hammer, pull and slide', source:gestures, views:['score'], fixed:true,
    goal:'Read a hammer-on and pull-off on string three, followed by a slide, wide vibrato and a dead strike.',
    edit:'Change 7/3[h] to 8/3[h] and vibrato wide to vibrato. Compare the connected frets and the width of the vibrato.' },
  { id:'articulations', title:'Short notes and fermatas', source:articulations, views:['notation'], fixed:true,
    goal:'A dot below the first note asks for a short attack. The fermata over the second asks the player to hold it.',
    edit:'Change below to above for the staccato. The mark changes side while the written quarter-note duration stays the same.' },
  { id:'tied-chord', title:'Follow a tied chord', source:tied, views:guitar,
    goal:'The same two strings ring across a barline, even when their order changes in the second chord.',
    edit:'Narrow the score and step through the reader to bar two. Select the tied event to find its source.' },
  { id:'diagnostics', title:'Find a missing beat', source:errors, views:staff,
    goal:'A complete 3/4 measure has three quarter notes. The editor keeps the last complete drawing while you fix a bar.',
    edit:'Delete E4 and run the score. Use Find error, restore the quarter, and run again.' },
  { id:'sor-op35-no22', title:'Sor · Study in B minor', source:sor, views:guitar, demo:true,
    goal:'Bars 1–8 of Op. 35 No. 22. Sustain the half-note melody over the moving eighths and hold the bass across the first barline.',
    edit:'Choose Guitar · TAB and compare the circled fingering with the fret on string two. Change finger 2 to finger 3 on the opening note.',
    edition:{ credit:'Glen Larsen’s Mutopia engraving after N. Simrock (CC BY-SA 3.0). This adaptation uses editorial string choices and the original three voices. The adaptation shares the same license.', url:'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1850' } },
  { id:'joplin-maple-leaf', title:'Joplin · Maple Leaf Rag', source:joplin, views:staff, demo:true,
    goal:'Play the pickup and first strain, including both endings. In written measure 8 the right hand crosses onto the bass staff.',
    edit:'Lower the tempo from 92 to 72 and follow the two groups of three sixteenths. Listen for the return after the first ending.',
    edition:{ credit:'John Stark’s 1899 edition, via Chris Sawer’s public-domain Mutopia transcription. Fixed clefs and selected expression marks are editorial.', url:'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=23' } },
  { id:'handy-st-louis-blues', title:'Handy · The St. Louis Blues', source:handy, views:staff, demo:true,
    goal:'The first twelve sung bars of the 1914 edition carry two verses. Compare the syllables under the held notes, then rehearse the voice alone.',
    edit:'Choose Voice and change the opening lyric “I” to “We”. Prepare the vocal part and find the edit under the same attack.',
    edition:{ credit:'Pace & Handy, 1914. The public-domain facsimile supplies the melody, grace and two underlays. The chord symbols and piano reduction are editorial.', url:'https://commons.wikimedia.org/wiki/File:W._C._Handy_-_St._Louis_Blues_(1914,_Pace_and_Handy).pdf' } },
  { id:'haydn-emperor-variation', title:'Haydn · Emperor Quartet', source:haydn, views:staff, demo:true,
    goal:'Play the theme and Variation I of Op. 76 No. 3, movement II, from the pickup through bar 40. Violin II takes over the theme in the variation.',
    edit:'Choose Violoncello. Prepare the part and find the violin cue above the rest. Compare its page turn with the conductor’s turn at measure 22.',
    edition:{ credit:'OpenScore String Quartets, CC0, transcription 20428156. Principal notes, rhythms and measured-note slurs are retained. Grace notes, ornaments, dynamics and expressive text are omitted.', url:'https://github.com/OpenScore/StringQuartets/tree/2614b0b2958dd1ce3f52e172a43e5f4d0e29570f/scores/Haydn%2C_Joseph/String_Quartet_in_C_major%2C_Hob.III77%2C_Op.76_No.3' } },
  { id:'compound-picking', title:'Compound-time picking', source:picking, views:guitar, demo:true,
    goal:'A triplet plus one eighth fills the first dotted-quarter beat. Three ordinary eighths fill the second.',
    edit:'Move the tuplet block from the three frets on string one to the three on string two. The extra eighth now belongs to the other beat. Hide notation and count again.' },
  { id:'chord-workshop', title:'A-major chord workshop', source:workshop, views:['score'], fixed:true, demo:true,
    goal:'The natural cancels G-sharp on the open third string. The left-hand fingering belongs to fret two on string two.',
    edit:'Compare the two orders of the same voicing. Reorder one and keep [f] beside its fret on string two.' },
  { id:'bossa', title:'Two-voice bossa', source:bossa, views:guitar, demo:true,
    goal:'The top voice anticipates bar two by an eighth. The bass holds each note for two beats.',
    edit:'Swap the opening eighth rest and chord. The first chord moves forward while the bass and the tie keep their onsets.' },
  { id:'drop-d-turnaround', title:'Drop D turnaround', source:drop, views:['score','tab'], demo:true,
    goal:'In bar four, bend string three up to the E held on string two. Follow the sixth-string palm mute through the repeat.',
    edit:'In the fullbend alias, change rise=1/2 to rise=1/4. The bend peaks an eighth earlier. Switch to tab and narrow the score to follow the mute across a break.' },
  { id:'slow-river', title:'Slow river', source:river, views:staff, demo:true,
    goal:'The Am frame shows a two-string barre. Am/G lands on the dotted slash. The lyric “roll” extends above its underline through two more attacks.',
    edit:'Change “Slow,” to “Drift,” and Am/G to C/G. Follow the syllable and chord to their attacks.' },
  { id:'repeat-endings', title:'Read the endings', source:repeats, views:guitar, demo:true,
    goal:'Take the first ending back to A. On the next pass, skip to the half-note G in the second ending.',
    edit:'Insert break system before the first note in ending 2. Read the second ending on its own row and select its note.' },
  { id:'guitar-duet', title:'Guitar duet for print', source:duet, views:staff, demo:true,
    goal:'Read the waltz as two players on one staff. Guitar one carries the tied melody. Guitar two plays the lower line.',
    edit:'Choose Guitar 2 and find its opening G3. Compare it with the full score, switch between A4 and Letter, then save a page as SVG.' },
  { id:'embed-workbench', title:'Two independent editors', source:workbench, views:guitar, demo:true,
    goal:'Two embeds start with the same music. Each owns its source, score and errors.',
    edit:'Break a bar in the first editor. Change a fret in the second, then repair the first. Resize the window and compare both.' },
];

export const reference = [
  ['fret/string · pitch', '0/1 is an open high E. C4 is middle C. Use b for flat, # for sharp and n for natural.', 'first-fret'],
  ['duration · dots · rest', ':q is a quarter, :h a half and :8 an eighth. Add a dot for a dotted note. A rest uses the current duration.', 'diagnostics'],
  ['alias · # comments', 'Declare alias v="vibrato" and write [v] after a note. A # comment continues to the end of the line.', 'guitar-gestures'],
  ['same-string runs', '4-5-6/3 plays three notes on string three. A mark after the run belongs to its final fret.', 'compound-picking'],
  ['meter · beams', 'Write meter 3/4 inside a part. After a barline, meter 6/8 sets the time for the next bar.', 'meter'],
  ['tuplet · tabStems', 'tuplet 3:2 { … } fits three notes into the time of two. Enable tabStems on in a guitar part.', 'triplets'],
  ['hammer · pull · slide · vibrato', 'Mark the arriving fret with [hammer], [pull] or [slide]. Use x/3 for a dead strike on string three.', 'guitar-gestures'],
  ['staccato · fermata', 'Use [staccato below] or [fermata above] after a head.', 'articulations'],
  ['key · chord · fingering', 'Set key A inside a part. Parentheses group heads. Place [finger 2 right] on the head it describes.', 'chord-workshop'],
  ['voice · tie', 'A named voice has its own rhythm. Mark the arriving head with [tie] to sustain its pitch.', 'bossa'],
  ['tuning · capo · palm mute', 'Set tuning dropD and capo 2 in a guitar part. Place the muted phrase inside palmMute strings(6) { … }.', 'drop-d-turnaround'],
  ['lyric · symbol · frame · slash', 'A lyric or chord symbol follows its attack. :q. slash is a dotted quarter slash. Frame strings run from low to high.', 'slow-river'],
  ['volta · ending · mark', 'The volta block gives the shared bars. Each numbered ending has its own block.', 'repeat-endings'],
  ['print · voice · paper', 'Select a one-based voice and choose A4 or Letter for an independent part.', 'guitar-duet'],
  ['layout · width · editor · Canvas', 'Set and data-editor="true" on an embed. Select SVG or Canvas with data-renderer.', 'embed-workbench'],
];
