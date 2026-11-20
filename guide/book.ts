// Read the guide's bundled chapters and mount only the examples on the open page.
import Div from '../src/div';
import { previousDraft } from './drafts';
import { scoreOptions } from './audio';
import { highlightCode, highlightEditor } from './highlight';
import historical from '../doc/tutorial.html?guide-content';
import gettingStarted from './quickstart.html?guide-content';
import additions from './features.html?guide-content';
import api from './reference.html?guide-content';
import { lessons, reference } from './catalog';

type Draft = (id: string, value?: string) => string | undefined;
export interface Chapter { id: string; title: string; element: HTMLElement }

/** Only repository-authored chapter markup is cloned. Score text and user drafts stay plain text. */
function chapters(html: string, selector: string, language: 'vextab' | 'javascript'): Chapter[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  highlightCode(template.content, language);
  return Array.from(template.content.querySelectorAll<HTMLElement>(selector), element => ({
    id: element.id, title: element.querySelector('h2').textContent.replace(/^Step \d+: /, ''), element,
  }));
}

export const tutorial = chapters(historical, 'section[data-step]', 'vextab');
export const features = chapters(additions, 'section[id]', 'vextab');
export const quickstart = chapters(gettingStarted, 'section[id]', 'javascript');
export const chapterBooks = { tutorial, quickstart, features };
export const groups = chapters(api, 'section[id]', 'javascript');

/** Keep the notation glossary searchable alongside the JavaScript API. */
const syntax = document.createElement('section');
syntax.innerHTML = '<h2>Notation and score options</h2>';
for (const [title, description, lesson] of reference) {
  const entry = document.createElement('article');
  entry.id = 'syntax-' + lesson;
  entry.append(node('h3', title), node('p', description), link('Try the notation →', '#lesson/' + lesson));
  syntax.append(entry);
}
groups.push({ id:'notation', title:'Notation and score options', element:syntax });

export function node<K extends keyof HTMLElementTagNameMap>(tag: K, text: string) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

export function link(text: string, href: string): HTMLAnchorElement {
  const anchor = node('a', text);
  anchor.href = href;
  return anchor;
}

/** Add a short publication-style heading without changing the score's text font. */
function heading(host: HTMLElement, section: string, title: string, intro?: string) {
  if (section) {
    const label = node('p', section);
    label.className = 'chapter-label';
    host.append(label);
  }
  host.append(node('h1', title));
  if (intro) {
    const lead = node('p', intro);
    lead.className = 'goal';
    host.append(lead);
  }
  document.title = title + ' · VexTab';
}

/** A chapter can have several independent editable examples, each with its own reset and draft. */
function examples(host: HTMLElement, chapter: Chapter, section: string, draft: Draft): Div[] {
  return Array.from(host.querySelectorAll<HTMLElement>('.vex-tabdiv, pre[data-score]'), (original, index) => {
    const source = original.textContent.trim();
    const fixed = original.classList.contains('vex-tabdiv');
    const key = section + '/' + chapter.id + '/' + index;
    const frame = document.createElement('div');
    frame.className = 'chapter-example' + (fixed ? ' fixed' : '');
    const embed = document.createElement('div');
    embed.setAttribute('editor', 'true');
    embed.setAttribute('editor-height', original.getAttribute('editor_height') ?? '110');
    if (fixed) {
      embed.setAttribute('width', original.getAttribute('width'));
      embed.setAttribute('scale', original.getAttribute('scale'));
    } else embed.setAttribute('layout', 'flow');
    embed.textContent = draft(key) ?? source;
    const controls = document.createElement('div');
    controls.className = 'example-controls';
    const reset = node('button', 'Reset example');
    controls.append(node('span', 'VexTab source'), reset);
    const oldDraft = previousDraft(key);
    if (oldDraft) controls.append(oldDraft);
    frame.append(embed, controls);
    original.replaceWith(frame);
    const editor = new Div(embed, scoreOptions(embed));
    const input = embed.querySelector('textarea');
    input.setAttribute('aria-label', chapter.title + ' · example ' + (index + 1));
    highlightEditor(input);
    input.oninput = () => draft(key, input.value);
    reset.onclick = () => {
      input.value = source;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      editor.run();
    };
    return editor;
  });
}

export function showCover(host: HTMLElement): Div {
  const cover = document.createElement('div');
  cover.className = 'book-cover';
  const introduction = document.createElement('div');
  heading(introduction, '', 'The VexTab Tutorial',
    'Write standard notation and guitar tablature, one stave at a time. Play and edit the music as you work through the original fifteen steps.');
  const start = link('Start with the stave →', '#tutorial/' + tutorial[0].id);
  start.className = 'start-reading';
  const paths = node('nav', '');
  paths.className = 'cover-links';
  paths.setAttribute('aria-label', 'More ways to use VexTab');
  paths.append(node('span', 'Or'), link('Embed in your code', '#quickstart'),
    link('Explore features', '#features'), link('Read the API reference', '#reference'));
  introduction.append(start, paths);
  const figure = document.createElement('figure');
  const sample = document.createElement('div');
  const original = tutorial.find(c => c.id === 'notes').element.querySelectorAll('.vex-tabdiv')[1];
  sample.setAttribute('width', original.getAttribute('width'));
  sample.textContent = original.textContent;
  const caption = node('figcaption', '');
  caption.append(link('Fret and string · from step 2', '#tutorial/notes'));
  figure.append(sample, caption);
  cover.append(introduction, figure);
  host.append(cover);
  directory(host, tutorial, 'tutorial', 'In this tutorial', true);
  return new Div(sample, scoreOptions(sample));
}

/** The same table of contents also supplies permanent URLs and chapter order. */
function directory(host: HTMLElement, items: Chapter[], section: string, title: string, numbered = false) {
  const list = document.createElement(numbered ? 'ol' : 'ul');
  list.className = 'chapter-list';
  for (const item of items) {
    const line = node('li', '');
    line.append(link(item.title, '#' + section + '/' + item.id));
    if (!numbered) line.append(node('p', item.element.querySelector('p').textContent));
    list.append(line);
  }
  host.append(node('h2', title), list);
}

export function showFeatures(host: HTMLElement) {
  heading(host, 'Features', 'Beyond the tutorial', 'Take the same notation into measured scores, independent voices, lead sheets and printed parts.');
  directory(host, features, 'features', 'Writing with VexTab 5');
  host.append(node('h2', 'Practice scores'));
  const practice = node('ul', '');
  practice.className = 'practice-links';
  for (const lesson of lessons.filter(item => !item.demo)) {
    const item = node('li', '');
    item.append(link(lesson.title, '#lesson/' + lesson.id));
    practice.append(item);
  }
  host.append(practice);
}

/** Display the original prose, tables and examples in their written sequence. */
export function showChapter(host: HTMLElement, section: keyof typeof chapterBooks, chapter: Chapter, draft: Draft): Div[] {
  const sequence = chapterBooks[section];
  const index = sequence.indexOf(chapter);
  const body = chapter.element.cloneNode(true) as HTMLElement;
  body.removeAttribute('id');
  body.querySelector('h2').remove();
  body.className = 'chapter-body';
  const label = section === 'tutorial' ? 'Tutorial · Step ' + (index + 1) + ' of ' + sequence.length
    : section === 'quickstart' ? 'Developer quickstart' : 'Beyond the tutorial';
  heading(host, label, chapter.title);
  host.append(body);
  const editors = examples(body, chapter, section, draft);
  const pages = node('nav', '');
  pages.className = 'page-turn';
  pages.setAttribute('aria-label', 'Chapter navigation');
  if (index) pages.append(link('← ' + sequence[index - 1].title, '#' + section + '/' + sequence[index - 1].id));
  else pages.append(section === 'quickstart' ? link('← Guide home', '#tutorial') : link('← Contents', '#' + section));
  const next = sequence[index + 1];
  pages.append(next ? link(next.title + ' →', '#' + section + '/' + next.id)
    : section === 'features' ? link('Read the studies →', '#studies') : link('Explore features →', '#features'));
  host.append(pages);
  return editors;
}

/** Search across signatures, arguments, examples and prose, including when starting at a deep link. */
export function showReference(host: HTMLElement, id = '') {
  const group = groups.find(g => g.id === id || Array.from(g.element.querySelectorAll('article')).some(a => a.id === id));
  heading(host, 'VexTab 5', 'API reference', 'Look up a module, method, editor option or notation command.');
  const label = node('label', 'Search the reference');
  label.htmlFor = 'search';
  const search = document.createElement('input');
  search.id = 'search';
  search.type = 'search';
  search.placeholder = 'Try parseScore, setWidth or palm mute';
  const status = node('p', '');
  status.className = 'result-count';
  status.setAttribute('role', 'status');
  const results = node('div', '');
  results.className = 'reference-results';
  host.append(label, search, status, results);
  function filter() {
    // Accept the same qualified method spelling a reader would use in JavaScript.
    const words = search.value.toLowerCase().replace(/\(\)/g, '').split(/[\s.]+/).filter(Boolean);
    results.replaceChildren();
    let count = 0;
    for (const category of groups) {
      if (!words.length && group && group !== category) continue;
      const block = node('section', '');
      block.append(node('h2', category.title));
      for (const source of category.element.querySelectorAll('article')) {
        if (!words.length && group && id !== category.id && source.id !== id) continue;
        const type = category.id === 'editors' ? 'Div' : '';
        const terms = [category.title, type, source.id, source.textContent].join(' ').toLowerCase();
        if (!words.every(word => terms.includes(word))) continue;
        const entry = source.cloneNode(true) as HTMLElement;
        const title = entry.querySelector('h3');
        title.replaceChildren(link(title.textContent, '#reference/' + source.id));
        block.append(entry);
        count++;
      }
      if (block.childElementCount > 1) results.append(block);
    }
    status.textContent = count ? count + (count === 1 ? ' entry' : ' entries') : 'No matching entries. Try another term.';
  }
  search.oninput = filter;
  filter();
}
