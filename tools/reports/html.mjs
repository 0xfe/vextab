// Render standalone report and archive pages. All repository and Git metadata is untrusted text.
import { readFileSync } from 'node:fs';
import { siteTheme } from '../site-theme.mjs';
const css = siteTheme + readFileSync(new URL('./report.css', import.meta.url), 'utf8');
const interactions = readFileSync(new URL('./interactions.js', import.meta.url), 'utf8');
const repo = 'https://github.com/0xfe/vextab';
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const json = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');
const num = (n) => n.toLocaleString('en-US');
const kib = (n) => num(Math.round((n / 1024) * 10) / 10) + ' KiB';
const percent = ({ hit, total }) => (total ? ((100 * hit) / total).toFixed(1) + '%' : '—');
const date = (s) => new Date(s).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const link = (url, label) => `<a href="${escape(url)}">${escape(label)}</a>`;
const detail = (title, html) => `<details><summary>${escape(title)}</summary>${html}</details>`;
const card = (value, label) => `<div class="kpi"><strong>${escape(value)}</strong><span>${escape(label)}</span></div>`;
const bar = (label, value, fraction, note) =>
  `<div class="bar"><span>${escape(label)}</span><strong>${escape(value)}</strong><span class="track"><i style="width:${Math.min(100, Math.max(0, fraction * 100))}%"></i></span><small>${escape(note)}</small></div>`;

/** Headers are text; row producers supply escaped text, numeric values or trusted links. */
function table(headers, rows) {
  return `<div class="scroll"><table><thead><tr>${headers.map((h) => '<th scope="col">' + escape(h) + '</th>').join('')}</tr></thead><tbody>${rows.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('')}</tbody></table></div>`;
}
const filter = (label, content) =>
  `<div><label hidden>${escape(label)} <input type="search" placeholder="Filter rows"></label>${content}</div>`;

/** A small machine-readable header lets publishers merge the static archive without scraping tables. */
export function readEntries(html) {
  const raw = /<script type="application\/json" id="report-entries">([^<]*)<\/script>/.exec(html)?.[1];
  if (!raw) throw Error('Missing quality report metadata.');
  const entries = JSON.parse(raw);
  const count = (n) => Number.isSafeInteger(n) && n >= 0;
  const valid = (e) =>
    e &&
    /^[0-9a-f]{40}$/.test(e.commit) &&
    ['generated', 'committed'].every((k) => typeof e[k] === 'string' && Number.isFinite(Date.parse(e[k]))) &&
    ['branch', 'subject', 'version'].every((k) => typeof e[k] === 'string') &&
    (e.releaseTag === undefined || e.releaseTag === e.version || e.releaseTag === 'v' + e.version) &&
    count(e.core) &&
    count(e.loc) &&
    count(e.lines?.total) &&
    count(e.lines?.hit) &&
    e.lines.hit <= e.lines.total;
  if (!Array.isArray(entries) || !entries.every(valid) || new Set(entries.map((e) => e.commit)).size !== entries.length)
    throw Error('Invalid quality report metadata.');
  return entries;
}

/** Inline all assets so commit pages work offline and can be published in one atomic write. */
function page(title, body, entries, archiveHref, data) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · VexTab</title><style>${css}</style></head><body><header><div><b>VexTab</b>${link(archiveHref, 'Report archive')}</div></header><main>${body}</main><footer>VexTab · Repository quality reports</footer>
<script type="application/json" id="report-entries">${json(entries)}</script>
${data ? `<script type="application/json" id="report-data">${json(data)}</script>` : ''}
<script>${interactions}</script></body></html>`;
}

/** A compact summary travels with both the commit page and its historical archive row. */
export function summary(r) {
  return {
    commit: r.commit,
    branch: r.branch,
    subject: r.subject,
    version: r.version,
    ...(r.releaseTag && { releaseTag: r.releaseTag }),
    generated: r.generated,
    committed: r.committed,
    loc: r.source.files.reduce((n, f) => n + f.code, 0),
    lines: r.coverage.total.lines,
    core: r.bundles.find((b) => b.name === 'main.prod.js').gzip,
  };
}

/** Pin release reports above development measurements and expose their version in the first link. */
export function archivePage(entries) {
  const sorted = [...entries].sort((a, b) => {
    const byRelease = Number(Boolean(b.releaseTag)) - Number(Boolean(a.releaseTag));
    const dateField = a.releaseTag && b.releaseTag ? 'committed' : 'generated';
    return byRelease || Date.parse(b[dateField]) - Date.parse(a[dateField]) || a.commit.localeCompare(b.commit);
  });
  const rows = sorted.map((e) => [
    (e.releaseTag ? '<strong class="release-label">Release</strong> ' : '') +
      link(e.commit + '/index.html', 'VexTab ' + e.version),
    link(repo + '/commit/' + e.commit, e.commit.slice(0, 12)),
    escape(e.subject),
    escape(e.branch),
    date(e.generated),
    num(e.loc),
    percent(e.lines),
    kib(e.core),
  ]);
  return page(
    'Quality report archive',
    `<h1>Quality report archive</h1>
  <p class="intro">Browse ${num(rows.length)} commit ${rows.length === 1 ? 'report' : 'reports'} by version, branch, or revision. Tagged releases appear first.</p>
  ${filter('Find a report', table(['Version / report', 'Commit', 'Change', 'Branch', 'Reported', 'Code lines', 'Line coverage', 'Browser API · gzip'], rows))}`,
    sorted,
    './index.html'
  );
}

/** Summarize authored lines and expose every measured file. */
function sourceSection(files, src) {
  const group = new Map();
  for (const f of files) {
    const g = group.get(f.group) ?? { files: 0, code: 0, comments: 0, blank: 0 };
    g.files++;
    for (const k of ['code', 'comments', 'blank']) g[k] += f[k];
    group.set(f.group, g);
  }
  return `<section id="source"><h2>Source footprint</h2><p class="intro">Tracked JavaScript and TypeScript, grouped by purpose. Code on a line takes precedence over comments. Historical release bundles and vendored support libraries are excluded. The Jison grammar is outside this JS/TS count.</p>
  ${table(
    ['Area', 'Files', 'Code lines', 'Comment-only', 'Blank'],
    [...group]
      .sort((a, b) => b[1].code - a[1].code)
      .map(([k, g]) => [escape(k), num(g.files), num(g.code), num(g.comments), num(g.blank)])
  )}
  ${detail(
    'All ' + num(files.length) + ' source files',
    filter(
      'Find a source file',
      table(
        ['File', 'Code', 'Comments', 'Blank', 'Total'],
        [...files]
          .sort((a, b) => b.code - a.code)
          .map((f) => [src(f.file), num(f.code), num(f.comments), num(f.blank), num(f.lines)])
      )
    )
  )}</section>`;
}

/** Show measured coverage with the raw denominator for each metric. */
function coverageSection(c, src) {
  return `<section id="coverage"><h2>Test coverage</h2><p class="intro">Full browser QUnit suite · ${num(c.tests.passed)} tests passed, ${num(c.tests.skipped)} skipped, ${num(c.tests.todo)} todo. Istanbul measures compiled library modules in Chrome. Modules outside the test import graph have zero hits. The generated parser, declarations and Node-only tests are excluded.</p>
  <div class="bars">${Object.entries(c.total)
    .map(([k, v]) =>
      bar(k[0].toUpperCase() + k.slice(1), percent(v), v.hit / (v.total || 1), num(v.hit) + ' of ' + num(v.total))
    )
    .join('')}</div>
  ${detail(
    'Coverage by module',
    filter(
      'Find a module',
      table(
        ['Module', 'Lines hit / total', 'Lines', 'Statements', 'Branches', 'Functions'],
        [...c.files]
          .sort((a, b) => a.lines.hit / (a.lines.total || 1) - b.lines.hit / (b.lines.total || 1))
          .map((f) => [
            src(f.file),
            num(f.lines.hit) + ' / ' + num(f.lines.total),
            percent(f.lines),
            percent(f.statements),
            percent(f.branches),
            percent(f.functions),
          ])
      )
    )
  )}</section>`;
}

/** Rank functions without dropping the lower-complexity details. */
function complexitySection(functions, src) {
  const complexityRows = (rows) => rows.map((f) => [num(f.score), escape(f.name), src(f.file, f.line)]);
  return `<section id="complexity"><h2>Cyclomatic complexity</h2><p class="intro">ESLint’s classic measure counts independent paths per function, including short-circuit conditions, default arguments and optional chains. Ranked across src/.</p>
  ${table(['Paths', 'Highest-complexity functions', 'Source'], complexityRows(functions.slice(0, 10)))}
  ${detail('All ' + num(functions.length) + ' measured functions and initializers', filter('Find a function', table(['Paths', 'Function', 'Source'], complexityRows(functions))))}</section>`;
}

/** Link compiler findings to the exact revision and line. */
function deadSection(findings, src) {
  return `<section id="dead-code"><h2>Dead-code candidates</h2><p class="intro">TypeScript flagged ${num(findings.length)} unused declarations, parameters, imports or unreachable statements in the library. Public exports can have external callers. Review each finding before removing code.</p>
  ${
    findings.length
      ? table(
          ['Source', 'Diagnostic', 'Finding'],
          findings.map((f) => [src(f.file, f.line), escape(f.rule), escape(f.message)])
        )
      : ''
  }</section>`;
}

/** Compare the production browser distributions on a common scale. */
function sizeSection(bundles) {
  const largest = Math.max(...bundles.map((b) => b.raw));
  return `<section id="build-sizes"><h2>Production build sizes</h2><p class="intro">Fresh minified browser bundles. The bars compare raw size with the largest bundle. Transfer estimates use gzip level 9 and Brotli; external source maps are excluded.</p>
  <div class="bars">${bundles.map((b) => bar(b.name, kib(b.raw), b.raw / largest, 'raw JavaScript')).join('')}</div>
  ${table(
    ['Bundle', 'Raw bytes', 'Gzip', 'Brotli'],
    bundles.map((b) => [escape(b.name), num(b.raw), kib(b.gzip), kib(b.brotli)])
  )}</section>`;
}

/** Show the runtime footprint and the complete locked direct dependencies. */
function dependencySection(d) {
  return `<section id="dependencies"><h2>Dependencies</h2><p class="intro">The root npm lockfile contains ${num(d.unique)} distinct package names across ${num(d.locations)} install locations. ${num(d.production)} locations are in the production tree.</p>
  ${table(
    ['Direct runtime package', 'Requested', 'Locked', 'License'],
    d.direct
      .filter((p) => p.kind === 'Runtime')
      .map((p) => [escape(p.name), escape(p.range), escape(p.version), escape(p.license)])
  )}
  ${detail(
    'All ' + num(d.direct.length) + ' direct declarations',
    filter(
      'Find a dependency',
      table(
        ['Package', 'Use', 'Requested', 'Locked', 'License'],
        d.direct.map((p) => [p.name, p.kind, p.range, p.version, p.license].map(escape))
      )
    )
  )}
  ${detail(
    num(d.duplicates.length) + ' packages with multiple locked versions',
    table(
      ['Package', 'Versions'],
      d.duplicates.map((p) => [escape(p.name), escape(p.versions.join(', '))])
    )
  )}</section>`;
}

/** Render summary charts and the complete underlying file, function and dependency tables. */
export function commitPage(r) {
  const s = summary(r);
  const src = (file, line) =>
    link(
      `${repo}/blob/${r.commit}/${file.split('/').map(encodeURIComponent).join('/')}${line ? '#L' + line : ''}`,
      file + (line ? ':' + line : '')
    );
  const major = r.source.complexity.filter((f) => f.score > 10);
  const body = `<h1>VexTab ${escape(r.version)} quality report</h1><p class="subject">${escape(r.subject)}</p>
  <div class="meta">${link(repo + '/commit/' + r.commit, r.commit.slice(0, 12))}<span>${escape(r.branch)}</span>${r.releaseTag ? link(repo + '/releases/tag/' + encodeURIComponent(r.releaseTag), 'Release ' + r.releaseTag) : ''}<span>Measured ${date(r.generated)}</span></div>
  <div class="kpis">${card(num(s.loc), 'Authored code lines')}${card(percent(s.lines), 'Browser line coverage')}${card(num(major.length), 'Complexity above 10')}${card(kib(s.core), 'Browser API bundle · gzip')}</div>
  <nav aria-label="Report sections">${['Source', 'Coverage', 'Complexity', 'Dead code', 'Build sizes', 'Dependencies'].map((t) => link('#' + t.toLowerCase().replace(' ', '-'), t)).join('')}</nav>
${sourceSection(r.source.files, src)}
  ${coverageSection(r.coverage, src)}
  ${complexitySection(r.source.complexity, src)}
  ${deadSection(r.source.dead, src)}
  ${sizeSection(r.bundles)}
  ${dependencySection(r.dependencies)}
  <section><h2>Measurement details</h2><p class="intro">Committed ${date(r.committed)}. Generated with Node ${escape(r.node)} from a fresh checkout. The JSON download includes every row and the exact measurement counts.</p><button id="download" data-commit="${r.commit}" hidden>Download report JSON</button></section>`;
  return page('VexTab ' + r.version + ' quality · ' + r.commit.slice(0, 12), body, [s], '../index.html', r);
}
