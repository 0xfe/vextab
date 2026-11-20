// Highlight guide snippets and mirror editable VexTab without replacing its native text input.
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';

Prism.manual = true;

/** Colour incomplete input too, so highlighting can follow edits before a score parses. */
const notation = {
  string: /"(?:\\.|[^"\\\r\n])*"?|\$[^$\r\n]*\$?/,
  keyword: /\b(?:tabstave|stave|piano|voice|options|notes|text|slur)\b/,
  property: /[\w-]+(?==)/,
  command: /![\w-]+/,
  boolean: /\b(?:true|false)\b/,
  duration: /:(?:\d+|[qwh])d*|\^\d+\^?/,
  pitch: /\b(?:kick|snare|hat)\b|[A-G](?:##|@@|[#@n])?~?(?=[/.-])|##|\bX(?=\/)/,
  fingering: { pattern: /\bf[0-5T](?=[:,\]])/, alias: 'property' },
  operator: /[<>|!=:/^()[\].-]|[bhpszT](?=\d)/,
  number: /\d+/,
};
Prism.languages.vextab = notation;
// The body of an HTML embed can itself contain several lines of notation.
const markup = Prism.languages.extend('markup', {
  score: { pattern: /\b(?:tabstave|stave|piano|notes|voice|options|slur|text)\s+[^<>\r\n]+/, inside: notation },
});

type Language = 'vextab' | 'javascript' | 'html' | 'bash';
const grammars = { vextab: notation, javascript: Prism.languages.javascript, html: markup, bash: Prism.languages.bash };

/** Prism escapes the source and emits only styled token spans, including for unfinished markup. */
function paint(target: HTMLElement, source: string, language: Language) {
  target.innerHTML = Prism.highlight(source, grammars[language], language);
}

/** Process inline code and listings once, before cloning a chapter or filtering reference entries. */
export function highlightCode(container: ParentNode, fallback: Language) {
  for (const item of container.querySelectorAll<HTMLElement>('pre:not([data-score]), code')) {
    // Nested code owns a listing's tokens. Preserve emphasis in tutorial placeholders.
    if (item.childElementCount) continue;
    const language = item.closest<HTMLElement>('[data-language]')?.dataset.language as Language;
    paint(item, item.textContent, language ?? fallback);
  }
}

/** Keep native selection, undo, IME and source offsets. The coloured copy is decorative. */
export function highlightEditor(input: HTMLTextAreaElement) {
  const wrapper = document.createElement('div');
  wrapper.className = 'syntax-editor';
  const mirror = document.createElement('pre');
  mirror.className = 'syntax-layer';
  mirror.setAttribute('aria-hidden', 'true');
  input.before(wrapper);
  wrapper.append(mirror, input);
  input.spellcheck = false;
  const syncScroll = () => {
    mirror.scrollTop = input.scrollTop;
    mirror.scrollLeft = input.scrollLeft;
  };
  const syncText = () => {
    paint(mirror, input.value, 'vextab');
    syncScroll();
  };
  input.addEventListener('input', syncText);
  input.addEventListener('scroll', syncScroll);
  syncText();
}
