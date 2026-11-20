# VexTab engineering reports

Use a full clone with release tags, the Node version in `.nvmrc`, npm and Chrome. Set `CHROME_BIN` to select another Chromium executable. Run these commands from the repository root.

```sh
npm ci
npm run report:setup
npm run report:history
npm run improvements:build
npm run improvements:verify
```

Open **build/reports/index.html** for the quality archive and **build/improvements/index.html** for AI2026. Both work offline. The first build needs registry access to install the dependencies locked by each historical revision. Subsequent builds reuse matching installs in `build/report-cache/`. The reporting tools have a separate lockfile in `tools/`.

The **Engineering reports** GitHub Actions workflow runs on numeric release tags and on manual dispatch. Download its artifact and keep the two report directories together to follow links between them. Website publication is a separate command.

## Quality archive

| Command | What it measures |
| --- | --- |
| `npm run report` | Rebuild the committed HEAD |
| `npm run report -- 4.0.0` | Rebuild a tag or commit descended from 4.0.0, including the baseline |
| `npm run report:history` | Fill missing reports for reachable release tags and HEAD, then refresh the archive |
| `npm run report:history -- --all-commits` | Fill every commit on the ancestry path from 4.0.0 to HEAD, including merges |

Each measurement runs in a detached local clone. It uses the revision’s source, webpack configuration, lockfile and browser tests. Click a commit to inspect the searchable tables or download the complete measurement as JSON.

| Metric | Population and units |
| --- | --- |
| Source footprint | Code, comment-only and blank lines in tracked JS and TS. Excludes generated release bundles, vendored support files and the Jison grammar. |
| Complexity | Classic ESLint cyclomatic complexity per library function, including field initializers. Each row links to source. |
| Dead-code candidates | TypeScript unused and unreachable diagnostics in library source. Public consumers can use exported declarations. |
| Browser coverage | Istanbul statements, compiled lines, branches and functions in the revision’s QUnit suite. Every first-party TS implementation under `src/` starts with zero hits. The generated Jison parser and separate integration suites are outside the denominator. |
| Bundle size | Raw, gzip level 9 and Brotli bytes of the fresh production `main.prod.js` and `div.prod.js` bundles. |
| Dependencies | Root manifest ranges and lockfile versions, licenses, install locations and duplicate versions. |

## Illustrated history (AI2026)

The report compares **4.0.0** with the committed HEAD. Search the chapters, commits or public browser API signatures. Open a score for side-by-side engravings. Shared examples use the same VexTab text and fixed SVG renderer. Current studies use the flow renderer and the score sources from the endpoint’s guide.

`changes.json` contains chapters, the release trail, documentation changes, public declaration changes, commit history and quality summaries. `render-inventory.json` records the exact score, revision, viewport crop and PNG checksum for each capture. The baseline did not ship public declarations, so both endpoints use the same pinned TypeScript declaration emitter. Edit `tools/improvements/catalog.mjs` to curate chapters and exhibits.

## Publish

Use the authenticated Google Cloud CLI account for the VexFlow website. Preview both uploads first.

```sh
npm run report:upload -- --history --dry-run
npm run improvements:upload -- --dry-run
```

Remove `--dry-run` to publish. Upload the quality archive first so both endpoint links work when AI2026 goes live. Quality pages go under `gs://vexflow.com/vextab/reports/` at immutable commit and release URLs. The publisher merges the archive index with a generation precondition. Omit `--history` to publish only HEAD or pass `--commit=<ref>` for one earlier measurement.

AI2026 goes under `gs://vexflow.com/vextab/reports/ai2026/`. The uploader stages the reviewed local report, uploads content-versioned assets with a one-year cache, then publishes short-cache JSON and HTML. Use `--rebuild` to regenerate and verify it before uploading.
