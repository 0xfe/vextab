// Render the editable grammar v2 example and preserve the last valid picture during edits.
import { scoreOptions } from '../guide/audio';
import { parseScore, renderScore, Player } from '../src/browser';
import { throttle } from '../src/utils';

document.addEventListener('DOMContentLoaded', () => {
  const host = document.querySelector<HTMLElement>('#boo');
  const input = document.querySelector<HTMLTextAreaElement>('#blah');
  const status = document.querySelector<HTMLElement>('#error');
  const { playback } = scoreOptions(host);
  let player: Player;

  function render() {
    try {
      const score = parseScore(input.value);
      const next = document.createElement('div');
      renderScore(next, score, { width: 600 });
      host.replaceChildren(next);
      player?.dispose();
      player = new Player(score, { playback });
      player.render(next.querySelector('svg'));
      delete host.dataset.previewStale;
      status.textContent = '';
    } catch (error) {
      if (host.firstChild) host.dataset.previewStale = 'true';
      status.textContent = (host.firstChild ? 'Showing the last valid score. ' : '') + error.message;
    }
  }
  const schedule = throttle(render, 250);
  input.addEventListener('input', () => { player?.removeControls(); schedule(); });
  render();
});
