// Mount the ordinary VexTab editor and player on the complete converted document.
const host = document.getElementById('score');
host.dataset.width = Math.min(1000, Math.max(320, host.clientWidth - 25));
const instrument = document.getElementById('instrument');
const editor = new window.vextab.Div(host, {
  capacity: 'large',
  view: host.dataset.view,
  ...(instrument && instrument.value !== 'conductor' && { partIndex: Number(instrument.value) }),
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
