// Interactive playground harness used by playground.html for manual rendering checks.
import { scoreOptions } from '../guide/audio';
import * as _ from '../src/utils';
import * as vextab from '../src/main';

$(() => {
  // Local aliases for the public API to keep the playground readable.
  const VexTab = vextab.VexTab;
  const Artist = vextab.Artist;
  const Renderer = vextab.Vex.Flow.Renderer;

  // Debug toggles for the playground.
  Artist.DEBUG = true;
  VexTab.DEBUG = false;

  const host = document.querySelector<HTMLElement>('#boo')!;

  // Initialize VexTab artist and parser.
  const artist = new Artist(10, 10, 700, { scale: 0.8 });
  const tab = new VexTab(artist);
  const { playback, playbackControls } = scoreOptions(host);
  const player = new vextab.Player(artist, { playback, controls: playbackControls });

  /**
   * Parse the textarea contents and render into the SVG renderer.
   * Design note: errors are surfaced in the UI for quick feedback.
   */
  function render() {
    try {
      // Reset state on each render to avoid stale layout artifacts.
      tab.reset();
      artist.reset();
      tab.parse($('#blah').val());
      const next = document.createElement('div');
      artist.render(new Renderer(next, Renderer.Backends.SVG));
      host.replaceChildren(next);
      player.setTempo(Number(artist.customizations.tempo));
      player.setInstrument(artist.customizations.instrument);
      player.render();
      delete host.dataset.previewStale;
      $('#error').text('');
    } catch (e: any) {
      // Surface errors in the playground UI for quick debugging.
      console.error(e);
      if (host.firstChild) host.dataset.previewStale = 'true';
      $('#error').text((host.firstChild ? 'Showing the last valid score. ' : '') + e.message);
    }
  }

  // Debounce keystrokes to avoid flooding renders.
  const schedule = _.throttle(render, 250);
  $('#blah').on('input', () => { player.removeControls(); schedule(); });
  render();
});
