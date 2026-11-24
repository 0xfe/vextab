// Load a standalone reader on demand and connect its output to the guide's existing score editor.
import type Div from '../src/div';
import type { ImportOptions, ImportResult } from '../importer/src/types';

// Empty for checkout builds that serve the local readers.
declare const __IMPORT_CDN: string;
export const hostedGuide = 'https://vexflow.com/vextab/guide/';
export const hasImportAssets = document.documentElement.dataset.importingAssets === 'true' && location.protocol !== 'file:';

type Reader = (source: string, options: ImportOptions) => ImportResult;

/** Fetch the selected reader on first use from the release CDN or local development server. */
async function loadReader(format: 'lilypond' | 'musicxml'): Promise<Reader> {
  const url = new URL((__IMPORT_CDN || '../runtime/import/') + format + '.mjs', document.baseURI);
  const entry = await import(/* webpackIgnore: true */ url.href);
  return format === 'lilypond' ? entry.importLilyPond : entry.importMusicXML;
}

/** Convert only on request. A failed attempt leaves the last editable score visible and labeled. */
export function mountImportExample(chapter: HTMLElement, editor: Div) {
  const work = chapter.querySelector<HTMLElement>('.import-example');
  if (!work) return;
  const format = work.dataset.format as 'lilypond' | 'musicxml';
  const source = work.querySelector('textarea');
  const output = chapter.querySelector<HTMLTextAreaElement>('.chapter-example textarea');
  const controls = document.createElement('div');
  controls.className = 'import-controls';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const diagnostics = document.createElement('ul');
  diagnostics.className = 'import-diagnostics';
  work.append(controls, status, diagnostics);

  if (!hasImportAssets) {
    source.readOnly = true;
    const link = document.createElement('a');
    link.href = hostedGuide + '#importing/' + format;
    link.textContent = 'Open the live converter';
    controls.append(link);
    status.textContent = 'This guide includes the source and editable VexTab result below. Live conversion runs in the hosted guide.';
    return;
  }

  const label = document.createElement('label');
  const mode = document.createElement('select');
  mode.add(new Option('Strict', 'strict'));
  mode.add(new Option('Partial', 'partial'));
  label.append('Conversion mode ', mode);
  const convert = document.createElement('button');
  convert.type = 'button';
  convert.textContent = 'Convert to VexTab';
  controls.append(label, convert);
  let revision = 0;
  function changed() {
    revision++;
    convert.disabled = false;
    diagnostics.replaceChildren();
    status.textContent = 'Convert again to update the VexTab below.';
  }
  source.addEventListener('input', changed);
  mode.addEventListener('change', changed);

  convert.onclick = async () => {
    const current = ++revision;
    convert.disabled = true;
    diagnostics.replaceChildren();
    status.textContent = 'Converting…';
    try {
      const read = await loadReader(format);
      if (current !== revision || !work.isConnected) return;
      const filename = 'example.' + (format === 'lilypond' ? 'ly' : 'musicxml');
      const result = read(source.value, {
        mode: mode.value as 'strict' | 'partial', targetProfile: 'expressive', filename,
      });
      for (const diagnostic of result.diagnostics) {
        const item = document.createElement('li');
        const find = document.createElement('button');
        find.type = 'button';
        find.textContent = 'Select source';
        find.onclick = () => { source.focus(); source.setSelectionRange(...diagnostic.range); };
        item.append(diagnostic.message + ' ', find);
        diagnostics.append(item);
      }
      if (result.status === 'failed') {
        status.textContent = 'Conversion failed. The editor still shows its previous score.';
        return;
      }
      output.value = result.documents[0].text;
      output.dispatchEvent(new Event('input', {bubbles:true}));
      editor.run();
      status.textContent = (result.status === 'exact' ? 'Exact conversion.' : 'Partial conversion. Review the warnings.') +
        ' The score below requires VexTab ' + result.target.minimumVersion + ' or later.';
    } catch {
      if (current === revision && work.isConnected)
        status.textContent = 'The converter could not run. Check the connection and try again. The editor still shows its previous score.';
    } finally {
      if (current === revision) convert.disabled = false;
    }
  };
}
