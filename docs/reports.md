# VexTab engineering reports

Use a full clone with release tags, the Node version in `.nvmrc`, npm and Chrome. Set `CHROME_BIN` to select another Chromium executable. Run these commands from the repository root.

```sh
npm ci
npm run report:setup
npm run report:history
npm run whatsnew:build
npm run whatsnew:verify
```

Open `build/reports/index.html` for the quality archive or `build/whatsnew/index.html` for **What's New?**. Both work offline. The first build needs registry access to install the dependencies locked by each historical revision. Subsequent builds reuse matching installs in `build/report-cache/`. The reporting tools have a separate lockfile in `tools/`.

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

## What's New?

The report opens with the newest release. Choose a version to read its highlights, see a score or browse the commits it shipped. Changes after the latest tag appear under **Unreleased** until the next tag includes them. The 4.0.0 chapter establishes the baseline, and the npm records cover two early patches without release tags. The topic chapters, visual index and API inventory cover the whole range from 4.0.0 to the committed HEAD.

`changes.json` includes release chapters in `editions` and records the first release containing each commit in `commits[].release`. To add a highlight, write its summary in `tools/whatsnew/releases.mjs` beside the commit that introduced it. The build uses Git ancestry to put the entry in its release, even when the work came from a feature branch. New releases without editorial highlights show commit subjects.

Edit `tools/whatsnew/catalog.mjs` to curate the cumulative topic chapters and score exhibits. Shared examples use identical VexTab text and renderer settings at both endpoints. Repertoire studies show the current engraving. `render-inventory.json` records the source, revision, crop and PNG checksum for every image. The API inventory uses the same TypeScript declaration emitter for both endpoints because the baseline did not ship declarations.

## Publish

Use the authenticated Google Cloud CLI account for the VexFlow website. Preview both uploads first.

```sh
npm run report:upload -- --history --dry-run
npm run whatsnew:upload -- --dry-run
```

Remove `--dry-run` to publish. Upload the quality archive first so both endpoint links work when the new report goes live. Quality pages go under `gs://vexflow.com/vextab/reports/` at immutable commit and release URLs. The publisher merges the archive index with a generation precondition. Omit `--history` to publish only HEAD or pass `--commit=<ref>` for one earlier measurement.

Publish [What's New?](https://vexflow.com/vextab/reports/whatsnew/) under `gs://vexflow.com/vextab/reports/whatsnew/`. The uploader stages the reviewed local report, uploads content-versioned assets with a one-year cache, then publishes short-cache JSON and HTML. Use `--rebuild` to regenerate and verify it before uploading. After it verifies the new index in the bucket, the uploader replaces the former `ai2026/index.html` with a redirect that preserves query strings and section links.
