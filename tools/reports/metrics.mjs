// Static measurements of tracked source, locked dependencies and production bundles.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import parser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import ts from 'typescript';

/** Historical bundles and vendored browser libraries are outside the authored code population. */
export function authored(file) {
  return /\.(?:[cm]?js|ts)$/.test(file) && !/^(build\/|dist\/|releases\/|support\/|node_modules\/)/.test(file);
}

/** Report blank, comment-only and code lines separately. Mixed lines count once as code. */
function lineCounts(source) {
  const lines = source.lines.length - Number(source.lines.at(-1) === '');
  const code = new Set(),
    comments = new Set();
  function mark(tokens, set) {
    for (const { loc } of tokens) {
      for (let n = loc.start.line; n <= loc.end.line; n++) set.add(n);
    }
  }
  mark(source.ast.tokens, code);
  mark(source.getAllComments(), comments);
  for (const n of code) comments.delete(n);
  return { lines, code: code.size, comments: comments.size, blank: lines - code.size - comments.size };
}

/** Use the compiler's binding analysis, preserving exported API that consumers may use. */
function unused(checkout, files) {
  const configPath = join(checkout, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, ' '));
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, checkout);
  Object.assign(options, { noUnusedLocals: true, noUnusedParameters: true, allowUnreachableCode: false, noEmit: true });
  const program = ts.createProgram(
    files.map((f) => join(checkout, f)),
    options,
  );
  const diagnostics = [];
  for (const file of files) {
    const source = program.getSourceFile(join(checkout, file));
    for (const diagnostic of program.getSemanticDiagnostics(source)) {
      if (![6133, 6138, 6192, 6196, 6198, 6199, 7027].includes(diagnostic.code)) continue;
      diagnostics.push({
        file,
        line: source.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
        rule: 'TS' + diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
      });
    }
  }
  return diagnostics;
}

/** Parse each file once for physical lines and ESLint's classic per-function complexity. */
export async function sourceMetrics(checkout, tracked) {
  const files = [],
    complexity = [];
  const linter = new Linter();
  let counts;
  const measure = {
    create(context) {
      return {
        Program() {
          counts = lineCounts(context.sourceCode);
        },
      };
    },
  };
  for (const file of tracked.filter(authored)) {
    const library = /^(src|entry)\//.test(file);
    counts = undefined;
    const messages = linter.verify(
      await readFile(join(checkout, file), 'utf8'),
      {
        files: ['**/*.{js,mjs,cjs,ts}'],
        languageOptions: { parser, sourceType: 'module' },
        plugins: { report: { rules: { lines: measure } } },
        rules: { 'report/lines': 'warn', complexity: library ? ['warn', 0] : 'off' },
        linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: false },
      },
      { filename: file },
    );
    const fatal = messages.find((m) => m.fatal);
    if (fatal) throw Error(`${file}:${fatal.line} ${fatal.message}`);
    if (!counts) throw Error('Missing token counts for ' + file);
    files.push({
      file,
      group: library
        ? 'Library'
        : ({ tests: 'Tests', demos: 'Demos', guide: 'Guide' }[file.split('/')[0]] ?? 'Tools & configuration'),
      ...counts,
    });
    for (const message of messages.filter((m) => m.ruleId === 'complexity')) {
      const match = /^(.*?) has a complexity of (\d+)\./.exec(message.message);
      if (!match) throw Error('Unrecognized ESLint complexity diagnostic: ' + message.message);
      complexity.push({ file, line: message.line, name: match[1], score: Number(match[2]) });
    }
  }
  complexity.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line);
  return {
    files,
    complexity,
    dead: unused(
      checkout,
      files.filter((f) => f.group === 'Library').map((f) => f.file),
    ),
  };
}

/** The lockfile counts installed package locations, including nested duplicate versions. */
export function dependencies(pkg, lock) {
  const entries = Object.entries(lock.packages).filter(([path]) => path);
  const direct = [];
  for (const [kind, ranges] of [
    ['Runtime', pkg.dependencies],
    ['Development', pkg.devDependencies],
    ['Optional', pkg.optionalDependencies],
    ['Peer', pkg.peerDependencies],
  ]) {
    for (const [name, range] of Object.entries(ranges ?? {})) {
      const resolved = lock.packages['node_modules/' + name];
      direct.push({
        name,
        kind,
        range,
        version: resolved?.version ?? 'unresolved',
        license: resolved?.license ?? 'unspecified',
      });
    }
  }
  const versions = new Map();
  for (const [path, item] of entries) {
    const name = item.name ?? path.split('node_modules/').at(-1);
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name).add(item.version);
  }
  return {
    direct,
    locations: entries.length,
    unique: versions.size,
    production: entries.filter(([, p]) => !p.dev).length,
    duplicates: [...versions]
      .filter(([, v]) => v.size > 1)
      .map(([name, v]) => ({ name, versions: [...v].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Compress the exact bytes of each published browser entry, excluding its external source map. */
export async function bundleSizes(checkout) {
  const rows = [];
  const manifest = JSON.parse(await readFile(join(checkout, 'package.json')));
  const modern = manifest.main?.startsWith('./dist/runtime/');
  for (const name of modern ? ['vextab.js'] : ['main.prod.js', 'div.prod.js']) {
    const bytes = await readFile(join(checkout, modern ? 'dist/runtime' : 'dist', name));
    rows.push({
      name,
      raw: bytes.length,
      gzip: gzipSync(bytes, { level: 9 }).length,
      brotli: brotliCompressSync(bytes).length,
    });
  }
  return rows;
}
