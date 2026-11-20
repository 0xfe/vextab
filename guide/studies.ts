// Mount the canonical M3 examples in the responsive editor and keep a draft for each study.
import Div from '../src/div';
import { scoreOptions } from './audio';
import guitar from './scores/drop-d-turnaround.vextab';
import lead from './scores/slow-river.vextab';

const studies = {
  guitar: { source: guitar, lesson: 'In Drop D, hold the sixth-string bass under the melody. At bar 4, bend string three up a whole tone while string two rings. The peak comes on beat two. Change rise=1/2 to rise=1/4 and follow the earlier peak. Narrow the window and trace the mute and first ending across rows.' },
  lead: { source: lead, lesson: 'Read the Am frame from the sixth string to the first. Leave the sixth string out and barre strings four and three. Change “Slow,” in the source and follow the comma, the hyphen in “riv-er” and the line under “roll”. The Am/G change lands on the dotted slash.' },
};

document.addEventListener('DOMContentLoaded', () => {
  const host = document.querySelector<HTMLElement>('#score');
  const choice = document.querySelector<HTMLSelectElement>('#study');
  const tab = document.querySelector<HTMLInputElement>('#tab');
  const drafts = new Map<string, string>();
  let current: keyof typeof studies;
  let editor: Div;

  function open(reset = false) {
    if (editor) {
      drafts.set(current, host.querySelector('textarea').value);
      editor.dispose();
    }
    current = choice.value as keyof typeof studies;
    const study = studies[current];
    if (reset) drafts.delete(current);
    host.textContent = drafts.get(current) ?? study.source;
    document.querySelector('#exercise').textContent = study.lesson;
    document.querySelector<HTMLElement>('#tab-control').hidden = current !== 'guitar';
    tab.checked = false;
    editor = new Div(host, scoreOptions(host, document.querySelector('.controls')));
  }
  choice.addEventListener('change', () => open());
  tab.addEventListener('change', () => editor.setPart(tab.checked ? 'tab' : 'score'));
  document.querySelector('#reset').addEventListener('click', () => open(true));
  open();
});
