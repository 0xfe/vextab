// Highlight guide snippets and mirror editable VexTab without replacing its native text input.
import Prism from 'prismjs';
import 'prismjs/components/prism-bash';

Prism.manual = true;

/** Colour incomplete input too, so highlighting can follow edits before a score parses. */
// Score strings, comments and durations take precedence over individual marks.
const notation = {
  comment: /\/\/[^\n]*/,
  string: /"(?:\\.|[^"\\])*"/,
  keyword: /\b(?:meter|pickup|guitar|staff|drums|piano|upper|lower|voice|fragment|layout|play|pattern|times|use|tuplet|beam|volta|ending|palmMute|strings|transpose|octave|text|mark|sign|bar|break|system|repeatStart)\b/,
  property: /\b(?:key|tuning|capo|view|stem|tabStems|ink|tempo|instrument|finger|tie|hammer|pull|slide|prebend|bend|lyric|symbol|frame|line|font|size|style)\b/,
  duration: /:(?:\d+|[qwh])\.{0,2}/,
  pitch: /\b(?:[A-G](?:bb|##|[#bn])?[0-8]|(?:x|\d+)\/[1-8]|kick|snare|hat|rest|skip|slash)\b/,
  operator: /[{}|()[\],]/,
  number: /\d+/,
};
Prism.languages.vextab = notation;
const markup = Prism.languages.extend('markup', {
  score: { pattern: /(?:guitar|staff|piano|drums)\s*\{[^<>]+?\}/, inside: notation },
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
    paint(item, item.textContent, Object.prototype.hasOwnProperty.call(grammars, language) ? language : fallback);
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
