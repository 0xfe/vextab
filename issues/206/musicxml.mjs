// M0 timing probe. Count score features and translate the generated quarter-note control.
import { SaxesParser } from 'saxes';

/** Feed UTF-8 bytes in bounded chunks, retaining decoder state across character boundaries. */
export function probe(bytes, writeControl = false) {
  const xml = new SaxesParser();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const bars = [];
  let notes = 0, timed = 0, grace = false, chord = false, field = '', step = '', octave = '';
  xml.on('opentag', ({ name }) => {
    if (name === 'note') {
      notes++;
      grace = chord = false;
      step = octave = '';
    }
    if (name === 'grace') grace = true;
    if (name === 'chord') chord = true;
    if (writeControl && (name === 'step' || name === 'octave')) field = name;
  });
  xml.on('text', text => {
    if (field === 'step') step += text;
    if (field === 'octave') octave += text;
  });
  xml.on('closetag', ({ name }) => {
    if (name === field) field = '';
    if (name === 'note') {
      if (!grace && !chord) timed++;
      if (writeControl) bars.push(step + octave);
    }
    if (writeControl && name === 'measure') bars.push('|');
  });
  for (let i = 0; i < bytes.length; i += 16384) {
    xml.write(decoder.decode(bytes.subarray(i, i + 16384), { stream: true }));
  }
  xml.write(decoder.decode()).close();
  return { notes, timed, ...(writeControl && { text: 'staff { :q ' + bars.join(' ') + ' }' }) };
}
