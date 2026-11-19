// The guide, demo library and playground share one warmed renderer and one catalogue of scores.
import Div from '../src/div';
import { renderScorePart, type Part } from '../src/score/layout';
import { lessons, reference, type Lesson } from './catalog';
import './style.css';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => el<HTMLButtonElement>(id);
const choice = (id: string) => el<HTMLSelectElement>(id);
const drafts = new Map<string, string>();
const views: Record<Part, string> = { score:'Paired', notation:'Notation', tab:'Tab' };
let lesson: Lesson;
let editor: Div;
let partner: Div;
let input: HTMLTextAreaElement;
let readId: string;
let routeRevision = 0;

/** Persistent storage can be disabled by a host. The in-page draft still survives navigation. */
function draft(id: string, value?: string): string | undefined {
  const key = 'vextab.guide.' + id;
  if (value !== undefined) drafts.set(id, value);
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return drafts.get(id) ?? localStorage.getItem(key) ?? undefined;
  } catch { return drafts.get(id); }
}

function link(title: string, href: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.textContent = title;
  a.href = href;
  return a;
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

function printPart(): void {
  const part = el('part');
  part.replaceChildren();
  button('print').disabled = true;
  el('print-status').textContent = '';
  if (lesson.id !== 'guitar-duet') return;
  const score = editor?.getScore();
  if (!score) return;
  const voice = Number(choice('player').value);
  try {
    const result = renderScorePart(part, score, 'notation', { voice, title: 'Guitar duet · Guitar ' + voice,
      paper: choice('paper').value as 'A4' | 'Letter' });
    el('print-status').textContent = result.publication.diagnostics.map(d => d.detail).join(' ');
    button('print').disabled = !!result.publication.diagnostics.length;
  } catch (error) { el('print-status').textContent = error.message; }
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
  return new Div(host);
}

function setSource(text: string): void {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles:true }));
  editor.run();
}

function showLesson(current: Lesson, section: string): void {
  const playground = section === 'playground';
  lesson = current;
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

/** Render repository-authored entries as text. Search includes syntax and musical terms. */
function showIndex(isReference: boolean): void {
  el('index-title').textContent = isReference ? 'Language reference' : 'Demo library';
  document.title = el('index-title').textContent + ' · VexTab';
  el('search-label').hidden = !isReference;
  el('integration').hidden = !isReference;
  const query = el<HTMLInputElement>('search').value.trim().toLowerCase();
  const items = isReference ? reference : lessons.filter(l => l.demo).map(l => [l.title, l.goal, l.id]);
  const entries = el('entries');
  entries.replaceChildren();
  for (const [title, description, id] of items) {
    if (isReference && !(title + ' ' + description).toLowerCase().includes(query)) continue;
    const section = document.createElement('section');
    const p = document.createElement('p');
    p.textContent = description;
    section.append(link(title, '#lesson/' + id), p);
    entries.append(section);
  }
  if (!entries.childElementCount) entries.textContent = 'No matching entries.';
}

/** Hash URLs work offline and on a static server. The plain triplet anchor predates this guide. */
function navigate(): void {
  routeRevision++;
  editor?.dispose();
  partner?.dispose();
  editor = partner = undefined;
  el('second').replaceChildren();
  const [section, id] = location.hash.slice(1).split('/');
  const isIndex = section === 'demos' || section === 'reference';
  const selected = lessons.find(l => l.id === (id ?? section)) ?? lessons[0];
  el('index').hidden = !isIndex;
  el('lesson').hidden = isIndex;
  document.querySelectorAll<HTMLAnchorElement>('header a, aside a').forEach(a => {
    const active = a.closest('aside')
      ? !isIndex && a.hash === '#lesson/' + selected.id
      : a.hash.split('/')[0] === '#' + (section === 'playground' || isIndex ? section : 'lesson');
    if (active) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  });
  if (isIndex) showIndex(section === 'reference'); else showLesson(selected, section);
  el('main').dataset.route = location.hash;
}

for (const l of lessons) {
  el(l.demo ? 'studies' : 'lessons').append(link(l.title, '#lesson/' + l.id));
  choice('picker').add(new Option(l.title, l.id));
}
choice('picker').onchange = () => { location.hash = '#playground/' + choice('picker').value; };
el('score').addEventListener('vextab-render', refresh);
el('search').addEventListener('input', () => showIndex(true));
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
button('save').onclick = () => {
  const url = URL.createObjectURL(new Blob([input.value], { type:'text/plain;charset=utf-8' }));
  const a = link(lesson.title, url);
  a.download = lesson.id + '.vextab'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
button('print').onclick = () => { const page = document.createElement('style');
  page.textContent = '@page { size: ' + choice('paper').value + '; margin: 0; }';
  document.head.append(page);
  document.body.classList.add('print-part');
  window.addEventListener('afterprint', () => { page.remove(); document.body.classList.remove('print-part'); }, { once: true });
  window.print(); };
window.addEventListener('keydown', event => {
  if (!el('lesson').hidden && (event.metaKey || event.ctrlKey) && event.altKey && event.code === 'KeyR') {
    event.preventDefault(); button('reset').click();
  }
});
window.addEventListener('hashchange', navigate);
navigate();
