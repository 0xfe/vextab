// Carry authored colours into the independent SVG pages produced by VexFlow Publication.
import type { PublicationResult } from 'vexflow';
import type { Attack, ParsedScore } from './model';

/** Preserve unpainted strokes, hollow shapes, and the opaque paper behind a tab fret. */
function colorInk(group: Element, color: string): void {
  group.setAttribute('fill', color);
  group.setAttribute('stroke', color);
  for (const el of group.querySelectorAll('[fill],[stroke]')) {
    if (el.matches('.vf-tabnote > rect') && el.nextElementSibling?.tagName === 'text') continue;
    for (const paint of ['fill', 'stroke']) {
      if (el.hasAttribute(paint) && el.getAttribute(paint) !== 'none') el.setAttribute(paint, color);
    }
  }
}

/** Publication rebuilds native objects. Its system measure numbers and source IDs survive pagination.
 * Write presentation attributes so standalone SVG, outline conversion and PDF share the same ink. */
export function colorPublication(publication: PublicationResult, parsed: ParsedScore, id: (event: Attack) => string): void {
  const overrides = new Map<string, Attack>();
  let coloredStaves = false;
  for (const measure of parsed.measures) {
    coloredStaves ||= !!measure.state.color;
    for (const voice of measure.voices) for (const event of voice.events) {
      if (event.color || event.chord?.color) overrides.set('vf-' + id(event), event);
    }
  }
  if (!coloredStaves && !overrides.size) return;
  for (const { svg } of publication.pages) {
    if (coloredStaves) {
      // Each written stave forces a new system. Cue insets carry their own source measure.
      for (const row of svg.querySelectorAll('[data-system]')) {
        const color = parsed.measures[Number(row.getAttribute('data-system')) - 1].state.color;
        if (color) colorInk(row.lastElementChild, color);
      }
      for (const inset of svg.querySelectorAll('[data-region][data-measure]')) {
        const color = parsed.measures[Number(inset.getAttribute('data-measure')) - 1].state.color;
        if (color) colorInk(inset, color);
      }
    }
    if (!overrides.size) continue;
    for (const group of svg.querySelectorAll('.vf-stavenote,.vf-tabnote')) {
      const event = overrides.get(group.getAttribute('data-vf-id'));
      if (event?.color) colorInk(group, event.color);
      if (event?.chord?.color) {
        // VexFlow attaches the chord annotation before the syllables on the same attack.
        const chord = group.querySelector('.vf-annotation');
        if (chord) colorInk(chord, event.chord.color);
      }
    }
  }
}
