// Compare the same public entry surface at both endpoints, including releases without shipped types.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { root, base, git as runGit, releases } from '../reports/snapshot.mjs';
import { highlights, npmPatches } from './releases.mjs';
export const repo = 'https://github.com/0xfe/vextab';
const git = (...args) => runGit(root, ...args);

/** Enumerate exports from the public entry point; skip private class implementation and JSDoc. */
export function declarations(checkout) {
  const src = join(checkout, 'src');
  const outDir = join(checkout, '.report-types');
  const entryName = existsSync(join(src, 'browser.ts')) ? 'browser' : 'main';
  const config = ts.readConfigFile(join(checkout, 'tsconfig.json'), ts.sys.readFile);
  const { options, fileNames } = ts.parseJsonConfigFileContent(
    { ...config.config, include: ['src/**/*.ts'] },
    ts.sys,
    checkout,
  );
  ts.createProgram(fileNames, {
    ...options,
    declaration: true,
    emitDeclarationOnly: true,
    rootDir: src,
    outDir,
    noEmit: false,
    noEmitOnError: false,
  }).emit();
  const entry = join(outDir, entryName + '.d.ts');
  const program = ts.createProgram([entry], { skipLibCheck: true, moduleResolution: ts.ModuleResolutionKind.Node10 });
  const checker = program.getTypeChecker(),
    source = program.getSourceFile(entry);
  if (!source) throw Error('Missing declaration output: ' + entry);
  const printer = ts.createPrinter({ removeComments: true });
  const print = (n) => printer.printNode(ts.EmitHint.Unspecified, n, n.getSourceFile()).replace(/\s+/g, ' ').trim();
  const api = new Map();
  for (const sym of checker.getExportsOfModule(checker.getSymbolAtLocation(source))) {
    const actual = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
    const name = sym.name;
    for (const d of actual.declarations ?? []) {
      const put = (key, signature) => api.set(key, [...(api.get(key) ?? []), signature]);
      if (ts.isClassDeclaration(d) || ts.isInterfaceDeclaration(d)) {
        put(
          name,
          [
            ts.isClassDeclaration(d) ? 'class' : 'interface',
            name,
            ...(d.typeParameters ?? []).map(print),
            ...(d.heritageClauses ?? []).map(print),
          ].join(' '),
        );
        for (const m of d.members) {
          if (
            m.modifiers?.some((t) => [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(t.kind)) ||
            ts.isPrivateIdentifier(m.name ?? m)
          )
            continue;
          const member = m.name?.getText() ?? (ts.isConstructorDeclaration(m) ? 'constructor' : '[signature]');
          const side = m.modifiers?.some((t) => t.kind === ts.SyntaxKind.StaticKeyword) ? 'static ' : '';
          put(name + '.' + side + member, print(m));
        }
      } else put(name, print(d));
    }
  }
  return api;
}

/** Compare declaration signatures by name, retaining all overloads. */
export function apiChanges(before, after) {
  if (!before.has('Artist') || !after.has('Artist')) throw Error('Missing public Artist declaration');
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap((name) => {
    const a = before.get(name)?.join('\n'),
      b = after.get(name)?.join('\n');
    return a === b ? [] : [{ name, before: a, after: b, change: a ? (b ? 'Changed' : 'Removed') : 'Added' }];
  });
}

/** The first release that reaches a commit owns it, including work merged from long-lived branches. */
function releaseChapters(head, commits, tags) {
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const editions = tags.map((tag) => ({ ...tag, url: repo + '/releases/tag/' + tag.tag }));
  editions.find((entry) => entry.tag === base).note =
    'VexTab 4.0.0 removed the Lodash dependency. Its renderer provides the baseline for the paired score examples below.';
  // npm published these two patches together. Only one of their release builds is reachable from master.
  if (byHash.has(npmPatches[0].hash)) {
    for (const patch of npmPatches) {
      if (!editions.some((edition) => edition.tag === patch.tag))
        editions.push({ ...patch, url: 'https://www.npmjs.com/package/vextab/v/' + patch.tag });
    }
    editions.sort((a, b) => a.tag.localeCompare(b.tag, 'en', { numeric: true }));
  }
  const latest = tags.at(-1);
  if (head !== latest.hash)
    editions.push({ tag: 'Unreleased', hash: head, date: git('show', '-s', '--format=%as', head), url: repo + '/commit/' + head });

  let previous = base;
  for (const edition of editions) {
    edition.highlights = [];
    if (!edition.hash || edition.tag === base) continue;
    edition.compare = repo + '/compare/' + previous + '...' + edition.hash;
    for (const hash of git('rev-list', previous + '..' + edition.hash).split('\n')) {
      const commit = byHash.get(hash);
      if (commit && !commit.release) commit.release = edition.tag;
    }
    previous = edition.hash;
  }
  for (const [prefix, title, body, figure] of highlights) {
    const commit = commits.find((entry) => entry.hash.startsWith(prefix));
    if (!commit) continue;
    editions.find((entry) => entry.tag === commit.release).highlights.push({ title, body, figure, hash: commit.hash });
  }
  // A newly tagged release has a readable chapter even before an editor supplies its highlights.
  for (const edition of editions) {
    const included = commits.filter((commit) => commit.release === edition.tag);
    edition.count = included.length;
    if (!edition.highlights.length && included.length) {
      const changes = included.filter((commit) => !commit.merge);
      edition.highlights = (changes.length ? changes : included).slice(0, 4)
        .map(({ subject: title, hash }) => ({ title, hash }));
    }
  }
  return editions.reverse();
}

/** Include merge and maintenance commits so each overview can be checked against the complete range. */
export function history(head) {
  const range = base + '..' + head;
  const commits = git('log', '--topo-order', '--format=%H%x1f%as%x1f%s%x1f%P%x1f%b%x1e', range)
    .split('\x1e')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [hash, date, subject, parents, body = ''] = s.split('\x1f');
      const paths = git('diff-tree', '--no-commit-id', '-r', '--name-only', parents.split(' ')[0], hash)
        .split('\n')
        .filter(Boolean);
      return { hash, date, subject, body, merge: parents.includes(' '), paths };
    });
  const docs = git('diff', '--name-status', '-M', base, head, '--', '*.md', 'guide/*.html', 'doc/*.html')
    .split('\n')
    .map((row) => row.split('\t'))
    .filter((row) => row[0])
    .map(([status, path, newPath]) => ({ status, path, newPath }));
  const tags = releases(head);
  return { commits, docs, releases: tags, editions: releaseChapters(head, commits, tags) };
}
