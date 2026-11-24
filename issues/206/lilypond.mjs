// A lexical sizing probe with a small absolute-quarter-note emitter for the paired synthetic score.

/** Scan comments, strings, commands and punctuation. Retain source positions without expanding music. */
export function probe(bytes, writeControl = false) {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const token = /\s+|%\{[\s\S]*?%\}|%[^\n]*|"(?:\\.|[^"\\])*"|\\[a-zA-Z][\w-]*|\\\\|<<|>>|[a-zA-Z]+[',]*\d*\.*|\d+|[^\s]/gy;
  const bars = [];
  let count = 0, match;
  while ((match = token.exec(source))) {
    const word = match[0];
    if (/^[%\s]/u.test(word)) continue;
    count++;
    if (writeControl && /^[a-g]'4$/.test(word)) bars.push(word[0].toUpperCase() + '4');
    if (writeControl && word === '|') bars.push('|');
  }
  return { tokens: count, ...(writeControl && { text: 'staff { :q ' + bars.join(' ') + ' }' }) };
}
