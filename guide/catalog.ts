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
import type { Part } from '../src/score/layout';

export interface Lesson {
  id: string;
  title: string;
  source: string;
  goal: string;
  edit: string;
  views: Part[];
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
    edit:'Change the second time signature to 3/4. Compare the beams. Try E@ instead of E to write E flat.' },
  { id:'triplets', title:'Hear a triplet', source:triplets, views:guitar,
    goal:'Three eighth-note frets occupy beat one. The quarter lands on beat two.',
    edit:'Switch to Tab and change the second fret. Remove ^3^ to see why the written durations now exceed 2/4.' },
  { id:'guitar-gestures', title:'Hammer, pull and slide', source:gestures, views:['score'], fixed:true,
    goal:'Read a hammer-on and pull-off on string three, followed by a slide, wide vibrato and a dead strike.',
    edit:'Change 5h7p5 to 5h8p5 and 3V to 3v. Compare the connected frets and the width of the vibrato.' },
  { id:'articulations', title:'Short notes and fermatas', source:articulations, views:['notation'], fixed:true,
    goal:'A dot below the first note asks for a short attack. The fermata over the second asks the player to hold it.',
    edit:'Change bottom to top for the staccato. The mark changes side while the written quarter-note duration stays the same.' },
  { id:'tied-chord', title:'Follow a tied chord', source:tied, views:guitar,
    goal:'The same two strings ring across a barline, even when their order changes in the second chord.',
    edit:'Narrow the score and step through the reader to bar two. Select the tied event to find its source.' },
  { id:'diagnostics', title:'Find a missing beat', source:errors, views:staff,
    goal:'A complete 3/4 measure has three quarter notes. The editor keeps the last complete drawing while you fix a bar.',
    edit:'Delete E/4 and run the score. Use Find error, restore the quarter, and run again.' },
  { id:'compound-picking', title:'Compound-time picking', source:picking, views:guitar, demo:true,
    goal:'A triplet plus one eighth fills the first dotted-quarter beat. Three ordinary eighths fill the second.',
    edit:'Move ^3^ from after 0-2-3/1 to after 0-2-3/2. The extra eighth now belongs to the other beat. Hide notation and count again.' },
  { id:'chord-workshop', title:'A-major chord workshop', source:workshop, views:['score'], fixed:true, demo:true,
    goal:'The natural cancels G-sharp on the open third string. The left-hand fingering belongs to fret two on string two.',
    edit:'Compare the two orders of the same voicing. Reorder one and change the fingering member index to follow string two.' },
  { id:'bossa', title:'Two-voice bossa', source:bossa, views:guitar, demo:true,
    goal:'The top voice anticipates bar two by an eighth. The bass holds each note for two beats.',
    edit:'Swap the opening eighth rest and chord. The first chord moves forward while the bass and the tie keep their onsets.' },
  { id:'drop-d-turnaround', title:'Drop D turnaround', source:drop, views:['score','tab'], demo:true,
    goal:'In bar four, bend string three up to the E held on string two. Follow the sixth-string palm mute through the repeat.',
    edit:'Change rise=1/2 to rise=1/4. The bend peaks an eighth earlier. Switch to tab and narrow the score to follow the mute across a break.' },
  { id:'slow-river', title:'Slow river', source:river, views:staff, demo:true,
    goal:'The Am frame shows a two-string barre. Am/G lands on the dotted slash. The lyric “roll” extends above its underline through two more attacks.',
    edit:'Change “Slow,” to “Drift,” and Am/G to C/G. Follow the syllable and chord to their attacks.' },
  { id:'repeat-endings', title:'Read the endings', source:repeats, views:guitar, demo:true,
    goal:'Take the first ending back to A. On the next pass, skip to the half-note G in the second ending.',
    edit:'Insert a new tabstave notation=true time=2/4 line before the final notes line. Read the second ending on its own row and select its note.' },
  { id:'guitar-duet', title:'Guitar duet for print', source:duet, views:staff, demo:true,
    goal:'Read the waltz as two players on one staff. Guitar one carries the tied melody. Guitar two plays the lower line.',
    edit:'Choose Guitar 2, then switch between A4 and Letter. Find the opening G3 and compare its part with Guitar 1.' },
  { id:'embed-workbench', title:'Two independent editors', source:workbench, views:guitar, demo:true,
    goal:'Two embeds start with the same music. Each owns its source, score and errors.',
    edit:'Break a bar in the first editor. Change a fret in the second, then repair the first. Resize the window and compare both.' },
];

export const reference = [
  ['fret/string · pitch/octave', '0/1 is an open high E. C/4 is middle C. @ means flat, # sharp and n natural.','first-fret'],
  ['duration · dots · rest', ':q is a quarter, :h a half, :w a whole, :8 an eighth. Append d for a dot. ## is a rest. Duration carries forward.','diagnostics'],
  ['meter · beams · stave', 'time=4/4 is the counting default. Declare the signature to display it. Automatic beams follow the meter. A new stave begins a row.','meter'],
  ['tuplet · ^3^ · tab-stems', '^3^ fits three preceding attacks into two. Tab stems default off. Set options tab-stems=true before the stave.','triplets'],
  ['hammer · pull · slide · vibrato', 'In fixed layout use h, p, s, v or V between or after frets. X/string strikes a dead string.','guitar-gestures'],
  ['staccato · fermata · articulation', 'In fixed layout $.a./bottom.$ places a staccato dot below the preceding note. $.a@a/top.$ places a fermata above it.', 'articulations'],
  ['key · chord · fingering', 'key=A sets the stave signature. Parentheses group heads. $.fingering/1:r:f:2.$ assigns finger two to the first member in fixed layout.','chord-workshop'],
  ['voice · tie', 'voice voice=bottom opens another voice in the same row. T carries a pitched note or chord across a boundary.','bossa'],
  ['tuning · capo · bend · pm', 'Tuning defaults to standard, capo to zero. Flow bend fractions span one attack. !pm 6! and !end-pm! delimit a mute in one voice.','drop-d-turnaround'],
  ['lyrics · chord symbol · frame · slash', 'In flow, !lyric and !chord follow an attack. :qSd gives a dotted quarter slash. Frames list strings from lowest to highest.','slow-river'],
  ['repeat · ending · mark · measure-numbers', 'Start and end repeats with =|: and =:|. !ending 1 bars=1! precedes the first attack. Numbering defaults off.','repeat-endings'],
  ['print · voice · paper', 'Independent notation parts accept a one-based voice, title and A4 or Letter paper. The source retains both voices.','guitar-duet'],
  ['layout · width · editor · Canvas', 'Embeds default to fixed layout. Use layout="flow" for measured SVG reflow. editor="true" enables source editing.','embed-workbench'],
];
