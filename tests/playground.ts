// tests/playground.ts
// Interactive playground harness used by playground.html for manual rendering checks.

// Load VexTab module.
import * as _ from '../src/utils'; // Utility helpers (throttle).
import * as vextab from '../src/main'; // VexTab public API entry point.

$(() => {
  const VexTab = vextab.VexTab; // Parser/renderer API.
  const Artist = vextab.Artist; // Rendering orchestrator.
  const Renderer = vextab.Vex.Flow.Renderer; // VexFlow renderer constructor.

  Artist.DEBUG = true; // Enable verbose rendering logs for debugging.
  VexTab.DEBUG = false; // Keep parser logs off by default.

  // Create VexFlow Renderer from canvas element with id #boo
  const renderer = new Renderer($('#boo')[0], Renderer.Backends.SVG); // SVG backend for the playground.

  // Initialize VexTab artist and parser.
  const artist = new Artist(10, 10, 700, { scale: 0.8 }); // Margin + width for the demo.
  const tab = new VexTab(artist); // Parser bound to the artist.

  /**
   * Parse the textarea contents and render into the SVG renderer.
   * Design note: errors are surfaced in the UI for quick feedback.
   */
  function render() {
    try {
      tab.reset(); // Reset parser state.
      artist.reset(); // Reset renderer state.
      tab.parse($('#blah').val()); // Parse VexTab from the textarea.
      artist.render(renderer); // Render the parsed score.
      $('#error').text(''); // Clear previous errors.
    } catch (e: any) {
      // Keep errors visible in the UI for manual debugging.
      console.error(e);
      $('#error').html(e.message.replace(/[\n]/g, '<br/>'));
    }
  }

  $('#blah').keyup(_.throttle(render, 250)); // Debounce keystrokes to avoid flooding renders.
  render(); // Render initial content on page load.
});
