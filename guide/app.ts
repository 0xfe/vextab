// The guide, demo library and playground share one warmed renderer and one catalogue of scores.
import Div from '../src/div';
import Player from '../src/player';
import { scoreOptions } from './audio';
import { renderScorePart, type Part } from '../src/score/layout';
import { lessons, type Lesson } from './catalog';
import { tutorial, features, groups, link, node, showCover, showChapter, showFeatures, showReference } from './book';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => el<HTMLButtonElement>(id);
const choice = (id: string) => el<HTMLSelectElement>(id);
const drafts = new Map<string, string>();
const views: Record<Part, string> = { score:'Paired', notation:'Notation', tab:'Tab' };
let lesson: Lesson;
let editor: Div;
let partner: Div;
let chapterEditors: Div[] = [];
let input: HTMLTextAreaElement;
let readId: string;
let routeRevision = 0;
let printRevision = 0;
let partPlayer: Player;
let printEdition: { html: string; pages: string[]; filename: string };


/** Persistent storage can be disabled by a host. The in-page draft still survives navigation. */
function draft(id: string, value?: string): string | undefined {
  const key = 'vextab.guide.' + id;
  if (value !== undefined) drafts.set(id, value);
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return drafts.get(id) ?? localStorage.getItem(key) ?? undefined;
  } catch { return drafts.get(id); }
}

/** Retain a musical event across reflow. A new edit starts a new reading revision. */
function read(step = 0): void {
  const events = editor?.getReadingEvents() ?? [];
  let index = events.findIndex(e => e.source + '/' + e.staff === readId);
  index = Math.max(0, Math.min(events.length - 1, Math.max(0, index) + step));
  const event = events[index];
  readId = event && event.source + '/' + event.staff;
  el('reading').textContent = event?.label ?? 'Run a valid score to read its events.';
  button('previous').disabled = !event || index === 0;
  button('next').disabled = !event || index === events.length - 1;
  button('select').disabled = !event;
}

/** Prepare a portable edition. A late font load cannot restore an obsolete preview. */
async function printPart(): Promise<void> {
  const revision = ++printRevision;
  partPlayer?.dispose();
  printEdition = undefined;
  for (const id of ['print', 'save-print', 'save-svg']) button(id).disabled = true;
  el('svg-page-label').hidden = true;
  const part = el('part');
  part.replaceChildren();
  el('print-status').textContent = '';
  if (lesson.id !== 'guitar-duet') return;
  const score = editor?.getScore();
  if (!score) return;
  const voice = choice('player').value === 'score' ? undefined : Number(choice('player').value);
  const paper = choice('paper').value as 'A4' | 'Letter';
  try {
    const title = voice ? 'Guitar duet · Guitar ' + voice : 'Guitar duet · Full score';
    const { publication, score: music } = renderScorePart(part, score, 'notation', { voice, title, paper });
    if (publication.diagnostics.length) {
      el('print-status').textContent = publication.diagnostics.map(d => d.detail).join(' ');
      return;
    }
    const options = scoreOptions(part, el('edition-controls'));
    partPlayer = new Player(music, { playback: options.playback, controls: options.playbackControls });
    partPlayer.render(publication.pages[0].svg);
    const { faces } = await import(/* webpackChunkName: "print-outlines" */ './outlines');
    if (revision !== printRevision) return;
    const html = publication.toPrintHTML(faces);
    const document = new DOMParser().parseFromString(html, 'text/html');
    const pages = Array.from(document.querySelectorAll('body > svg'), svg => new XMLSerializer().serializeToString(svg));
    printEdition = { html, pages, filename: 'guitar-duet-' + (voice ?? 'score') + '-' + paper };
    choice('svg-page').replaceChildren(...pages.map((_, i) => new Option(String(i + 1), String(i))));
    el('svg-page-label').hidden = pages.length < 2;
    for (const id of ['print', 'save-print', 'save-svg']) button(id).disabled = false;
  } catch (error) {
    if (revision === printRevision) el('print-status').textContent = error.message;
  }
}

function refresh(): void {
  if (!editor) return;
  button('error').disabled = !editor.getDiagnosticRange();
  read();
  printPart();
}

/** Replace editors only when navigating to a different score. Controls within a lesson keep the same source. */
function mount(host: HTMLElement, source: string, fixed = false): Div {
  host.textContent = source;
  host.setAttribute('editor', 'true');
  host.setAttribute('editor-height', '125');
  host.classList.toggle('fixed', fixed);
  if (fixed) {
    host.removeAttribute('layout');
    host.setAttribute('width','660');
  } else {
    host.setAttribute('layout','flow');
    host.removeAttribute('width');
  }
  return new Div(host, scoreOptions(host, host.id === 'score' ? el('view-controls') : undefined));
}

function setSource(text: string): void {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles:true }));
  editor.run();
}

function showLesson(current: Lesson, section: string): void {
  const playground = section === 'playground';
  lesson = current;
  el('lesson-section').textContent = playground ? 'Playground' : current.demo ? 'Studies' : 'Practice score';
  el('picker-label').hidden = !playground;
  choice('picker').value = lesson.id;
  readId = undefined;
  el('title').textContent = lesson.title;
  document.title = lesson.title + ' · VexTab';
  el('goal').textContent = lesson.goal;
  el('exercise').textContent = lesson.edit;
  el('reader').hidden = !!lesson.fixed;
  el('printing').hidden = lesson.id !== 'guitar-duet';
  el('workbench').hidden = lesson.id !== 'embed-workbench';
  el('narrow-control').hidden = !!lesson.fixed;
  el<HTMLInputElement>('narrow').checked = false;
  el('score').classList.remove('narrow');
  choice('view').replaceChildren(...lesson.views.map(value => new Option(views[value], value)));
  choice('view').disabled = lesson.views.length === 1;
  el<HTMLAnchorElement>('original').href = '#original/' + lesson.id;
  const play = el<HTMLAnchorElement>('play');
  play.href = (playground ? '#lesson/' : '#playground/') + lesson.id;
  play.textContent = playground ? 'Return to lesson' : 'Open in playground';
  el('notice').textContent = '';
  editor = mount(el('score'), section === 'original' ? lesson.source : draft(lesson.id) ?? lesson.source, lesson.fixed);
  input = el('score').querySelector('textarea');
  input.spellcheck = false;
  input.addEventListener('input', () => {
    draft(lesson.id, input.value);
    readId = undefined;
    read();
    printPart();
  });
  if (!el('workbench').hidden) partner = mount(el('second'), lesson.source);
  refresh();
}

/** List the complete studies separately from the short practice scores. */
function showStudies(host: HTMLElement) {
  document.title = 'Studies · VexTab';
  const lead = node('p', 'Read a complete piece, then change one musical idea in its source.');
  lead.className = 'goal';
  const entries = node('div', '');
  entries.id = 'entries';
  for (const study of lessons.filter(l => l.demo)) {
    const row = node('section', '');
    const title = node('h2', '');
    title.append(link(study.title, '#lesson/' + study.id));
    row.append(title, node('p', study.goal));
    entries.append(row);
  }
  host.append(node('h1', 'Studies'), lead, entries);
}

/** The contents follow the section the reader is in, including older bookmarked lesson URLs. */
function sidebar(section: string, active: string) {
  const contents = el('contents');
  contents.replaceChildren();
  function list(title: string, prefix: string, items: {id: string; title: string}[], numbered = false) {
    const links = document.createElement(numbered ? 'ol' : 'ul');
    for (const item of items) {
      const a = link(item.title, '#' + prefix + '/' + item.id);
      if (a.hash === active) a.setAttribute('aria-current', 'page');
      const li = node('li', '');
      li.append(a);
      links.append(li);
    }
    contents.append(node('h2', title), links);
  }
  if (section === 'tutorial') list('Tutorial contents', section, tutorial, true);
  if (section === 'features') {
    list('Beyond the tutorial', section, features);
    list('Practice scores', 'lesson', lessons.filter(l => !l.demo));
  }
  if (section === 'studies') list('Studies', 'lesson', lessons.filter(l => l.demo));
  if (section === 'reference') list('Reference categories', section, groups);
  if (section === 'playground') list('Score library', section, lessons);
}

/** Hash routes work in the hosted and offline editions. Old lesson and demo links still resolve. */
function navigate() {
  routeRevision++;
  printRevision++;
  printEdition = undefined;
  partPlayer?.dispose();
  editor?.dispose();
  partner?.dispose();
  chapterEditors.forEach(instance => instance.dispose());
  chapterEditors = [];
  editor = partner = undefined;
  el('score').replaceChildren();
  el('second').replaceChildren();
  const host = el('index');
  host.replaceChildren();
  let [section, id] = location.hash.slice(1).split('/');
  if (!section) section = 'tutorial';
  if (section === 'demos') section = 'studies';
  const score = lessons.find(l => l.id === (id ?? section));
  const isLesson = ['lesson', 'original', 'playground'].includes(section) || (!id && !!score);
  const selected = score ?? lessons[0];
  el('main').parentElement.classList.toggle('frontispiece', section === 'tutorial' && !id);
  let tab = section;
  let active = '#' + section + '/' + id;
  host.hidden = isLesson;
  el('lesson').hidden = !isLesson;
  if (isLesson) {
    tab = section === 'playground' ? section : selected.demo ? 'studies' : 'features';
    active = '#' + (tab === 'playground' ? tab : 'lesson') + '/' + selected.id;
    showLesson(selected, section);
  } else if (section === 'reference') {
    showReference(host, id);
    const category = groups.find(g => Array.from(g.element.querySelectorAll('article')).some(a => a.id === id));
    if (category) active = '#reference/' + category.id;
  } else if (section === 'studies') {
    showStudies(host);
  } else {
    const book = section === 'features' ? 'features' : 'tutorial';
    tab = book;
    const chapter = (book === 'features' ? features : tutorial).find(c => c.id === id);
    if (chapter) chapterEditors = showChapter(host, book, chapter, draft);
    else if (book === 'features') showFeatures(host);
    else chapterEditors = [showCover(host)];
  }
  sidebar(tab, active);
  for (const a of document.querySelectorAll<HTMLAnchorElement>('header nav a')) {
    if (a.hash.split('/')[0] === '#' + tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  el('main').dataset.route = location.hash;
}

for (const l of lessons) choice('picker').add(new Option(l.title, l.id));
// Keep keyboard navigation within the current lesson when skipping the sidebar.
document.querySelector<HTMLAnchorElement>('.skip').onclick = event => {
  event.preventDefault();
  el('main').focus();
};
const menu = button('menu');
menu.onclick = () => menu.setAttribute('aria-expanded', String(menu.getAttribute('aria-expanded') !== 'true'));
el('contents').onclick = event => {
  if ((event.target as Element).closest('a') && menu.offsetWidth) {
    menu.setAttribute('aria-expanded', 'false');
    el('main').focus();
  }
};
choice('picker').onchange = () => { location.hash = '#playground/' + choice('picker').value; };
el('score').addEventListener('vextab-render', refresh);
choice('view').addEventListener('change', () => editor.setPart(choice('view').value as Part));
el('narrow').addEventListener('change', () => el('score').classList.toggle('narrow', el<HTMLInputElement>('narrow').checked));
button('run').onclick = () => editor.run();
button('reset').onclick = () => { setSource(lesson.source); el('notice').textContent = 'Original source restored.'; };
button('error').onclick = () => editor.selectError();
button('previous').onclick = () => read(-1);
button('next').onclick = () => read(1);
button('select').onclick = () => {
  const event = editor.getReadingEvents().find(e => e.source + '/' + e.staff === readId);
  if (event) editor.selectSource(event.id, editor.getScore());
};
button('copy').onclick = async () => {
  const revision = routeRevision;
  try { await navigator.clipboard.writeText(input.value); if (revision === routeRevision) el('notice').textContent = 'Source copied.'; }
  catch { if (revision === routeRevision) { input.select(); el('notice').textContent = 'Source selected. Use your copy shortcut.'; } }
};
/** Save user-selected artifacts as local files, including when the guide runs offline. */
function download(content: string, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = link(filename, url);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
button('save').onclick = () => download(input.value, 'text/plain;charset=utf-8', lesson.id + '.vextab');
button('save-print').onclick = () => {
  if (printEdition) download(printEdition.html, 'text/html;charset=utf-8', printEdition.filename + '.html');
};
button('save-svg').onclick = () => {
  const page = Number(choice('svg-page').value);
  if (printEdition) download(printEdition.pages[page], 'image/svg+xml', printEdition.filename + '-' + (page + 1) + '.svg');
};
el<HTMLInputElement>('open').onchange = async event => {
  const picker = event.currentTarget as HTMLInputElement;
  const file = picker.files?.[0], revision = routeRevision;
  if (!file) return;
  try { const text = await file.text(); if (revision === routeRevision) setSource(text); }
  catch { if (revision === routeRevision) el('notice').textContent = 'The file could not be read.'; }
  picker.value = '';
};
choice('player').onchange = choice('paper').onchange = printPart;
// Print the same outlined pages that the reader can download and reopen offline.
button('print').onclick = () => {
  if (!printEdition) return;
  const frame = document.createElement('iframe');
  frame.title = 'Print guitar duet';
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
  frame.onload = () => {
    const child = frame.contentWindow;
    child.addEventListener('afterprint', () => frame.remove(), { once: true });
    child.focus();
    child.print();
  };
  frame.srcdoc = printEdition.html;
  document.body.append(frame);
};
window.addEventListener('keydown', event => {
  if (!el('lesson').hidden && (event.metaKey || event.ctrlKey) && event.altKey && event.code === 'KeyR') {
    event.preventDefault(); button('reset').click();
  }
});
window.addEventListener('hashchange', () => {
  navigate();
  window.scrollTo(0, 0);
});
navigate();
