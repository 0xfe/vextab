# Screen positions in written score time

Use the layout map from `renderScore` or `renderConductor` to place a cursor on an SVG or Canvas score. The same map turns a pointer location inside a note, sustain or rest into a written measure and offset.

```js
import { parseScore, renderScore } from 'vextab/browser';

const host = document.querySelector('#score');
const score = parseScore('meter 4/4 staff { :h C4 rest | break system :w D4 | }');
const view = renderScore(host, score);
const map = view.layoutMap;
const cursor = map.positionAt({ partIndex: 0, measure: 1, offset: '3/4' });
```

Beat four falls inside the half rest. Draw the cursor at `cursor.x`, from `cursor.staffBounds.top` to `cursor.staffBounds.bottom`. The equivalent point for hit testing is `{ x: cursor.x, y: cursor.staffCenterY }`. For the next downbeat, ask for measure 2 at offset zero.

## Musical addresses

| Input for `positionAt` | Meaning |
| --- | --- |
| `partIndex` | Zero-based source instrument. An instrument extracted from a v2 document keeps its original index. A standalone `ParsedScore` uses index zero. |
| `measure` | One-based written measure number. A pickup counts as measure 1. |
| `offset` | Whole notes from the beginning of this measure, as a number or a fraction string such as `'1/12'`. The closing barline is at the actual span of the measure, including a partial bar. |
| `staffIndex` | Optional zero-based display staff within the rendered instrument, from top to bottom. Defaults to the first displayed staff. A TAB-only or single-hand view has one staff at index zero. |

Both `positionAt(location)` and `hitTest({ x, y })` return the part, staff and measure, a numeric whole-note `offset`, the one-based `system`, and the following geometry.

| Field | Meaning |
| --- | --- |
| `x`, `staffCenterY` | Horizontal cursor position and vertical midpoint of the selected staff in local engraving units. |
| `staffBounds` | `left`, `right`, `top` and `bottom` of this staff in this measure, with half a staff space above and below the lines. |
| `systemBounds` | Outer edges of all staff bounds on this system, in the same units. |
| `eventIds` | Source event IDs for attacks, rests or skips starting on the selected physical staff. Simultaneous voices appear in score order. Cross-staff attacks follow their displayed staff. A sustain or a position between onsets returns an empty array. |

All instruments and voices on a system share the engraver's rhythmic columns. A voice that holds through another voice's attack can follow that column. The map interpolates linearly between adjacent columns and the closing barline. A centered whole-measure rest still starts on the downbeat. Use written time on every repeat visit. The transport determines the visit, swing, tempo and elapsed playback time.

## Pointers and reflow

```js
host.addEventListener('pointerdown', event => {
  const point = map.clientPoint(event);
  const hit = point && map.hitTest(point);
  if (hit) selectWrittenTime(hit.partIndex, hit.measure, hit.offset);
});
```

`clientPoint` converts viewport `clientX` and `clientY` to local engraving units using the SVG screen transform or the displayed Canvas rectangle. Canvas supports translation and axis-aligned CSS scaling on a borderless, unpadded canvas. Put decorative borders and padding on the host. Supply local units directly to `hitTest` when handling a point already expressed on the surface.

A pointer within half a local engraving pixel of a column snaps to that exact onset. Elsewhere, the returned offset is interpolated. Allow half a local pixel when mapping the result back to the screen. Inside a staff band the map follows rhythmic columns, so every interpolated position can round-trip. Outside the bands it also recognizes a visible ledger-line notehead and returns its attack. Other empty space returns `undefined`. Use `view.hitTest(x, y)` for the identity of the printed glyph under the pointer, including an optically displaced chord head. An unknown part, staff, measure or out-of-range offset also returns `undefined` from `positionAt`.

A map belongs to one rendered surface. After rendering again at a different width, use the new view's map and look up the saved written location again. CSS scaling alone preserves the engraving. `clientPoint` reads the current display transform for each pointer event. Keep the source revision with any stored event ID.

## Draw playback from an external clock

Each screen score or conductor view can draw the guide’s playback bar and notehead glows on SVG or Canvas. Feed it the written address from your transport. A seek, repeat or loop can move to any address in either direction.

```js
const ink = view.createPlaybackOverlay();
const saved = { partIndex: 0, measure: 2, offset: '1/8' };
ink.setPosition(saved, 96); // Quarter notes per minute, including live tempo changes.
ink.clear();                // Hide the bar and glows during a count-in.
ink.setPosition(saved);     // Resume at the saved address.
ink.dispose();              // Release the overlay when replacing the view.
```

The address selects a column on the shared system. Every displayed voice contributes its sounding heads, including held chords, both piano hands and simultaneous conductor parts. Rests and silent heads carry no glow. The bar spans the active system, and pointer events pass through to the score. An address outside the rendered score clears the overlay.

Call `setPosition` when your transport updates. The overlay draws synchronously. The optional positive tempo controls the 75 ms anticipation and 140 ms fade within the current measure. Short notes use half their duration for each effect. The default is the score’s initial tempo or 120 BPM. After reflow, create an overlay on the new view and pass the saved address again.
