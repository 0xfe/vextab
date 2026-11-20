// Recover a draft saved by the v1 guide while editing the same lesson in grammar v2.
export function previousDraft(id: string): HTMLAnchorElement | undefined {
  let source: string | null;
  try { source = localStorage.getItem('vextab.guide.' + id); }
  catch { return; }
  if (source === null) return;
  const link = document.createElement('a');
  link.textContent = 'Download previous v1 draft';
  link.download = id.split('/').join('-') + '-v1.vextab';
  link.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(source);
  return link;
}
