// Mount the regular VexTab editor and use the parsed document's instrument names in the view menu.
const host = document.getElementById('score');
host.dataset.width = String(Math.min(1000, Math.max(320, host.clientWidth - 25)));
const instrument = document.getElementById('instrument');
if (instrument) {
  const model = window.vextab.parseScore(host.textContent, { capacity: 'large' });
  for (const [index, part] of model.parts.entries()) {
    instrument.add(new Option(part.name || 'Part ' + (index + 1), String(index), false,
      Boolean(host.dataset.openingPart) && part.name === host.dataset.openingPart));
  }
}
const conductor = instrument?.value === 'conductor';
const editor = new window.vextab.Div(host, {
  capacity: 'large',
  view: conductor ? 'conductor' : 'parts',
  ...(instrument && !conductor && { partIndex: Number(instrument.value) }),
  player: true,
  order: 'performed',
  playbackControls: document.getElementById('player'),
});
if (instrument) {
  instrument.onchange = () => editor.setInstrumentView(instrument.value === 'conductor' ? 'conductor' : { partIndex: Number(instrument.value) });
}
document.getElementById('edit').onclick = () => {
  const field = host.querySelector('textarea');
  field.focus();
  field.scrollIntoView({ block: 'center' });
};
document.documentElement.dataset.ready = String(Boolean(editor.getScore()));
