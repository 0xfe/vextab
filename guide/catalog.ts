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
import pocketChange from './scores/pocket-change.vextab';
import etudeThirds from './scores/chopin-etude-op25-no6.vextab';
import chopin from './scores/chopin-ballade-no3.vextab';
import consolation from './scores/liszt-consolation-no5.vextab';
import liszt from './scores/liszt-hungarian-rhapsody-no2.vextab';
import allOfMe from './scores/all-of-me.vextab';
import solea from './scores/flamenco-tab.vextab';
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
    goal:'The four frets on the first string sound E, F-sharp, G and F-sharp. Read the pitches above the tab, then follow the same four beats on the strings.',
    edit:'Change 3/1 to 5/1. The third pitch rises to A. Find it in the notation view and switch back to see the fifth fret beneath it.' },
  { id:'meter', title:'Count three or count two', source:meter, views:staff,
    goal:'Six eighth notes can feel like three beats or two. Compare the pairs under the beams in 3/4 with the groups of three in 6/8.',
    edit:'Change the second meter to 3/4. Both rows should now group the same six notes in pairs.' },
  { id:'triplets', title:'Hear a triplet', source:triplets, views:guitar,
    goal:'Play three frets evenly on the first beat, then give fret four the whole second beat. The beam and the 3 show where the triplet ends.',
    edit:'Choose Tab and remove the tuplet wrapper, keeping the three eighths. The bar now runs half a beat long. Restore the wrapper and check that fret four starts on beat two.' },
  { id:'guitar-gestures', title:'Hammer, pull and slide', source:gestures, views:['score'], fixed:true,
    goal:'Play fret five, hammer on to seven and pull back to five on the same string. The slide that follows connects two different frets on string four.',
    edit:'Change 7/3[h] to 8/3[h]. The hammer now travels three frets and the pull returns three frets. Listen for the higher middle pitch.' },
  { id:'articulations', title:'Short notes and fermatas', source:articulations, views:['notation'], fixed:true,
    goal:'The dot on the first note asks for a short attack. The fermata over the next note gives the player room to linger.',
    edit:'Change staccato below to staccato above. Look for the dot across the staff from its old position. The note still counts as a quarter.' },
  { id:'tied-chord', title:'Follow a tied chord', source:tied, views:guitar,
    goal:'A guitarist holds both strings over the barline. The next chord names the strings in reverse order, so follow the ties by pitch.',
    edit:'Narrow the score and step to the first chord in bar two. Select its source and find the tie on each arriving fret.' },
  { id:'diagnostics', title:'Find a missing beat', source:errors, views:staff,
    goal:'The three quarters C, D and E fill a bar of 3/4. When an edit leaves the bar short, the last valid score stays on the page.',
    edit:'Delete E4 and run the score. Choose Find error, put E4 back before the barline, and run again. The diagnostic should clear.' },
  { id:'sor-op35-no22', title:'Sor · Study in B minor', source:sor, views:guitar, demo:true,
    goal:'In the first eight bars of Sor’s Op. 35 No. 22, listen for the half-note melody above the moving eighths. The bass sounds across the first barline.',
    edit:'Change finger 2 to finger 3 on the opening note. Switch to Guitar · TAB and find the new fingering beside the same fret on string two.',
    edition:{ credit:'Glen Larsen’s Mutopia engraving after N. Simrock (CC BY-SA 3.0). This adaptation uses editorial string choices and the original three voices. The adaptation shares the same license.', url:'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1850' } },
  { id:'liszt-consolation-no5', title:'Liszt · Consolation No. 5', source:consolation, views:staff, demo:true,
    goal:'The left hand begins the Andantino alone. Follow its dotted pickup into the right hand, then listen for the melody above the repeated eighth notes at “espressivo con anima”.',
    edit:'Change the two tempo settings of 76 to 60 and the two settings of 68 to 54. Play from “poco rit.” and listen for the pulse to return at “a tempo”.',
    edition:{ credit:'Franz Liszt, Consolation No. 5 in E major, S.172/5. This excerpt follows the upbeat and first twenty bars of the Hal Leonard preview, with selected fingerings. The playback tempos are editorial.', url:'https://s3.amazonaws.com/halleonard-pagepreviews/HL_DDS_135672407UXxb3Nd2.png' } },
  { id:'liszt-hungarian-rhapsody-no2', title:'Liszt · Hungarian Rhapsody No. 2', source:liszt, views:staff, demo:true,
    goal:'In this passage from the Friska, the right hand plays a dotted eighth and a sixteenth against two even bass notes. Follow the accents across the barlines until the right hand changes to even eighths at “leggieriss.”',
    edit:'Lower the tempo from 144 to 96 and play the opening bars. The bass plays its fourth note before the right hand lands its short final chord.',
    edition:{ credit:'Franz Liszt, Hungarian Rhapsody No. 2, S.244/2. The nineteen-bar excerpt follows the Tempo giusto Vivace score reproduced by SE22 Piano School. The playback tempo is editorial.', url:'https://se22pianoschool.wordpress.com/wp-content/uploads/2011/08/screen-shot-2011-08-10-at-21-53-39.jpg' } },
  { id:'chopin-etude-op25-no6', title:'Chopin · Étude in thirds, Op. 25 No. 6', source:etudeThirds, views:staff, demo:true,
    goal:'Chopin opens with two bars of alternating thirds in the right hand. Listen for the bass entering in bar 3, then follow the first chromatic climb in bar 5.',
    edit:'Slow the quarter-note tempo from 138 to 90 to practise the thirds. In bar 5, change use ascent to use alternate to try the alternative fingering from the foot of the page.',
    edition:{ credit:'Frédéric Chopin, Étude in G-sharp minor, Op. 25 No. 6, bars 1–17. The six systems follow the Cantorion scan, with selected fingerings and fixed piano clefs. The printed half note at 69 gives 138 quarter notes per minute.', url:'https://cantorion.org/music/621/Etude-No.-6-Original-version' } },
  { id:'chopin-ballade-no3', title:'Chopin · Ballade No. 3', source:chopin, views:staff, demo:true,
    goal:'The opening 24 bars of Chopin’s A-flat major Ballade fit six to a system. In bars 2–4, follow the high E-flat while the voices underneath it move. The small staff below bar 3 offers another way to play the ornament.',
    edit:'Change the tempo from 132 to 96 and start at the opening. In bar 14, count the seven-note right-hand flourish against the bass. Listen for the hands to meet on the next downbeat.',
    edition:{ credit:'After the opening page engraved in VexFlow. This piano transcription uses fixed clefs and selected fingerings, slurs and dynamics. The ossia below bar 3 gives an alternative to the slashed grace note. Follow the pedal releases from bar 9 and listen for the grace chord in bar 22.', url:'https://github.com/vexflow/vexflow/blob/c2d965dda437f96c938403dfe18abfbb5db59779/tests/scores/ballade.js' } },
  { id:'all-of-me', title:'All of Me · Chord-melody guitar', source:allOfMe, views:guitar, demo:true,
    goal:'In this chord melody, one guitarist plays Django Reinhardt’s solo line and its bass together. Find the opening G13 and C6 grips in the diagrams, then listen for the high F over the open low E in bar 5.',
    edit:'Slow the tempo to 96 and compare the D7 and Dm7 diagrams. In bar 15, follow the bass from F-sharp to F and listen for the change from major to minor.',
    edition:{ credit:'“All of Me” by Gerald Marks and Seymour Simons. The top line follows the first 17 bars of Django Reinhardt’s guitar solo in Miguel Mateu’s transcription. This VexTab arrangement adds the bass, chord voicings and seven diagrams for solo guitar.', url:'https://cdn.ustatik.com/musescore/scoredata/g/a137b36c3a51e331b58d6906a476a34d8b8941c0/score_0.svg?no-cache=1715710756' } },
  { id:'flamenco-tab', title:'Soleá · Flamenco guitar', source:solea, views:guitar, demo:true,
    goal:'Begin the soleá with four strokes on the open first string. The letters i, a, m and i name the index, ring, middle and index fingers. The E and F diagrams show which treble strings to hold while the bass moves.',
    edit:'Set the tempo to 75 and follow the four marked fingers at the opening. In bar 3, find the change to F on beat three. From bar 9, follow the arpeggios as they move through Am, C and Fmaj7 back to E.',
    edition:{ credit:'VexTab study after the opening 16 bars of Eugen Sedko’s traditional soleá arrangement. The two diagrams show the exact three-string grips. The chord changes are editorial. Asterisks retain the player’s marks from the source.', url:'https://www.sheetmusicplus.com/en/product/traditional-solea-soleares-flamenco-guitar-notes-tabs-21752865.html' } },
  { id:'pocket-change', title:'Pocket Change · Bebop piano', source:pocketChange, views:staff, demo:true,
    goal:'The first bar of this sixteen-bar bebop head leaves room for the left hand to answer. Look for the opening figure in bars 5 and 13 of the handwritten Petaluma score.',
    edit:'Listen to the left-hand F–A–D in bar 1, then change performer parker to performer robot. Compare how closely the three fingers land and release. Leave the performer alone for the next pass and change swing eighths to swing off to hear the eighths straighten.',
    edition:{ credit:'An original VexTab piano score with a Parker-inspired head and left-hand comping.', url:'scores/pocket-change.vextab' } },
  { id:'joplin-maple-leaf', title:'Joplin · Maple Leaf Rag', source:joplin, views:staff, demo:true,
    goal:'In Maple Leaf Rag, follow the pickup through both endings of the first strain. In written bar 8, the right-hand notes cross onto the lower staff.',
    edit:'Set the tempo to 72 and follow the two groups of three sixteenths. At the first ending, listen for the return and then find the different ending on the second pass.',
    edition:{ credit:'John Stark’s 1899 edition, via Chris Sawer’s public-domain Mutopia transcription. Fixed clefs and selected expression marks are editorial.', url:'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=23' } },
  { id:'handy-st-louis-blues', title:'Handy · The St. Louis Blues', source:handy, views:staff, demo:true,
    goal:'The first twelve sung bars of St. Louis Blues carry two verses under one melody. Follow a held note and compare where the words of each verse change.',
    edit:'Choose Voice and replace the opening lyric “I” with “We”. Prepare the vocal part and look under the first attack for the new word.',
    edition:{ credit:'Pace & Handy, 1914. The public-domain facsimile supplies the melody, grace and two underlays. The chord symbols and piano reduction are editorial.', url:'https://commons.wikimedia.org/wiki/File:W._C._Handy_-_St._Louis_Blues_(1914,_Pace_and_Handy).pdf' } },
  { id:'haydn-emperor-variation', title:'Haydn · Emperor Quartet', source:haydn, views:staff, demo:true,
    goal:'The Haydn quartet plays the theme and its first variation, from the pickup through bar 40. Follow the tune in the conductor score as Violin II takes it over.',
    edit:'Choose Violoncello and prepare its part. Find the violin cue above the rest. Compare the first bar after the cello page turn with the conductor’s new page at measure 22.',
    edition:{ credit:'OpenScore String Quartets, CC0, transcription 20428156. Principal notes, rhythms and measured-note slurs are retained. Grace notes, ornaments, dynamics and expressive text are omitted.', url:'https://github.com/OpenScore/StringQuartets/tree/2614b0b2958dd1ce3f52e172a43e5f4d0e29570f/scores/Haydn%2C_Joseph/String_Quartet_in_C_major%2C_Hob.III77%2C_Op.76_No.3' } },
  { id:'compound-picking', title:'Compound-time picking', source:picking, views:guitar, demo:true,
    goal:'A dotted-quarter beat in 6/8 can hold a triplet of eighths followed by one ordinary eighth. Count the four attacks on the first string against the three ordinary eighths on the second.',
    edit:'Move the tuplet wrapper from the three frets on string one to the three on string two. Count the seven attacks again and find where the second dotted-quarter beat now starts.' },
  { id:'chord-workshop', title:'A-major chord workshop', source:workshop, views:['score'], demo:true,
    goal:'Read the same chord twice in A major. The open third string needs a natural to cancel the G-sharp in the key, and the finger number belongs to fret two on string two.',
    edit:'Reorder the frets inside one chord, keeping [f] with 2/2. Check the pitches, the natural sign and the finger number against the other chord.' },
  { id:'bossa', title:'Two-voice bossa', source:bossa, views:guitar, demo:true,
    goal:'The upper voice enters on an offbeat while the bass counts half notes. Listen for the last chord in bar one to anticipate bar two and ring across the barline.',
    edit:'Swap the opening eighth rest and the first chord. The chord now enters with the bass on beat one. Follow the tie into bar two and check that it still arrives at the same time.' },
  { id:'drop-d-turnaround', title:'Drop D turnaround', source:drop, views:['score','tab'], demo:true,
    goal:'Hold the Drop D bass under the melody. In bar four, string three bends a whole tone to meet the E already ringing on string two. The mute applies to string six.',
    edit:'Change rise=1/2 to rise=1/4 in the fullbend alias. The bend now reaches E an eighth note earlier. Narrow the tab and follow the sixth-string mute across a system break.' },
  { id:'slow-river', title:'Slow river', source:river, views:staff, demo:true,
    goal:'Read the two-string barre in the Am diagram, then find Am/G over the dotted slash. The underline after “roll” carries that syllable through two more attacks.',
    edit:'Change “Slow,” to “Drift,” and Am/G to C/G. Find the new word under its original note and the new chord name above the dotted slash.' },
  { id:'repeat-endings', title:'Read the endings', source:repeats, views:guitar, demo:true,
    goal:'Begin at A, play the first ending and return to A. On the second pass the shared phrase leads to a held G in the second ending.',
    edit:'Put break system before the first note of ending 2. Find the half-note G on its new row and select the note to locate the open third string in the source.' },
  { id:'guitar-duet', title:'Guitar duet for print', source:duet, views:staff, demo:true,
    goal:'Two guitarists share a staff. The upward stems carry the tied melody, while the downward stems give the second player a lower line.',
    edit:'Choose Guitar 2 and find its opening G3. Switch to the full score to see the G4 above it, then export the lower part alone on A4 or Letter.' },
  { id:'embed-workbench', title:'Two independent editors', source:workbench, views:guitar, demo:true,
    goal:'Each of these two editors starts with the same phrase and keeps its own edits. A rehearsal page can use this arrangement for two independent examples.',
    edit:'Remove a note from the first bar in the first editor. Change a fret in the second and check that it still redraws. Restore the missing note in the first to clear its diagnostic.' },
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
  ['layout · width · editor · Canvas', 'Set data-editor="true" on an embed. Select SVG or Canvas with data-renderer.', 'embed-workbench'],
];
