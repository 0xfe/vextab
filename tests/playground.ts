// Interactive playground harness used by playground.html for manual rendering checks.
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

  // Create VexFlow renderer from the playground canvas element.
  const renderer = new Renderer($('#boo')[0], Renderer.Backends.SVG);

  // Initialize VexTab artist and parser.
  const artist = new Artist(10, 10, 700, { scale: 0.8 });
  const tab = new VexTab(artist);

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
      artist.render(renderer);
      $('#error').text('');
    } catch (e: any) {
      // Surface errors in the playground UI for quick debugging.
      console.error(e);
      $('#error').html(e.message.replace(/[\n]/g, '<br/>'));
    }
  }

  // Debounce keystrokes to avoid flooding renders.
  $('#blah').keyup(_.throttle(render, 250));
  render();
});
