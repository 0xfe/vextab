# Build, test, and release VexTab

Run the commands from the repository root in Bash or Zsh.

## Local setup

Install Git, Google Chrome, and the Node.js version in `.nvmrc`. With nvm, run:

```sh
nvm install
nvm use
npm ci
```

The browser tests default to the installed Chrome. To use another Chrome or Chromium executable, set `CHROME_BIN` to its full path.

## Build and develop

```sh
npm start
```

The development server watches the source. Open the [project index](http://127.0.0.1:9005/) to find the demos, guide, playgrounds, and downloads. The [browser test suite](http://127.0.0.1:9005/tests.html) runs QUnit.

| Command | Output |
| --- | --- |
| `npm run build-dev` | Readable browser bundles and test pages in `dist/` |
| `npm run build:runtime` | Build the publishable modules, browser script, declarations and licenses into a clean `dist/runtime/` |
| `npm run build` | Build the runtime and the local production demos, tests and guide |
| `npm run watch` | Development bundles rebuilt on source changes |
| `npm run clean` | Removes the generated `dist/` directory |

## Importer guide and gallery

Use `npm start` and open the [importing lessons](http://127.0.0.1:9005/guide/index.html#importing) or the [13-score gallery](http://127.0.0.1:9005/guide/gallery/index.html). The first build builds the public importer modules and downloads six checksum-pinned editions. Later builds reuse the archives in `build/import-guide/sources/`. Restart the server after changing the importer or the gallery generator.

| Command | Purpose |
| --- | --- |
| `npm run guide:build` | Build the complete static site in `build/guide/`, including download links, pinned CDN imports and license notices |
| `npm run test:import-guide` | Build the site and test the lessons, nested gallery links, conversions and downloads in Chrome |
| `npm test --prefix importer` | Build and test the converter on its own after `npm ci --prefix importer` |
| `npm pack` | Build the runtime tarball with all three typed importer entries |

Add editions in [the gallery builder](../guide/gallery/build.mjs). Record the upstream revision, checksum and license, retain special selection options, and include an opening score image. After the guide build, run `node scripts/test-import-guide.mjs --previews` to regenerate the images from the rendered scores. [Per-format qualification and reference suites](../issues/212/README.md) · [Importer package API](../importer/README.md)

## Engineering reports

Generate the quality archive to track how VexTab has changed since 4.0.0. The accompanying **What's New?** report illustrates those changes with scores you can compare side by side. Both reports open locally in a browser. [Build and publication commands](reports.md)

## Diagnosing loose piano spacing

Compare the distance between the nearest staff lines in staff spaces so that zoom and print size do not affect the result. In the Consolation, a timed word and a low note on the opposite staff can share vertical space when they fall on different beats. Move the word under the note and the gap should open. The piano tests exercise both arrangements in SVG, Canvas and print. [Piano layout regressions](../tests/piano.ts)

VexTab passes the stave, beat and placement of each timed word to VexFlow. Piano parts use the public profile-spacing mode so the formatter can measure noteheads, stems, beams, strokes, curves and text where they occur. When diagnosing a gap, compare the measured staff distance with the same passage after moving the timed word or changing the slur. The VexFlow migration report records the API and the repertoire used to check it. [Score layout](../src/score/layout.ts) · [Engraving migration](../issues/213/README.md)

## Upload the user guide

Run these commands from the VexTab checkout. The dry run builds the production guide and prints the Cloud Storage operations. The live command uses your authenticated Google Cloud CLI.

```sh
npm run guide:upload -- --dry-run
npm run guide:upload
```

The destination is `gs://vexflow.com/vextab/guide/`, served at **https://vexflow.com/vextab/guide/**. Each upload builds in a fresh staging directory, uploads hashed bundles, the on-demand SoundFont instrument and print chunks first, then publishes the standalone lessons and the guide index. It verifies the uploaded HTML against the build. For a staging bucket, pass `-- --destination=gs://your-bucket/vextab/guide/`.

The web guide loads Tangerine Bold from Google Fonts. The hosted guide uses versioned jsDelivr scripts for VexFlow and VexTab. Publish the npm tarball and verify both CDN URLs before uploading the guide. To preview offline, run `npm run build-dev` and open `dist/guide/index.html`. The offline guide uses the included font and license.

## Test locally

```sh
npm audit
npm run lint
npm run typecheck
npm test
npm run build
```

Run these commands in order because the builds share `dist/`. The browser suite covers parsing, notation, the SVG playground, editor errors, and the legacy Canvas renderer. It also checks the DOM-free parser, reflow, independent part metadata, and keyboard source selection. [Shared-score API and coverage](vt5-m2.md)

For the M5 browser checks, install the engines that match the locked Playwright version. Numeric release tags run the same suite on the extracted package in all three engines.

```sh
npx --no-install playwright-core install firefox webkit
VEXTAB_BROWSER=firefox node scripts/test-browser.mjs
VEXTAB_BROWSER=webkit node scripts/test-browser.mjs
```

The four repertoire studies share their source with the guide and engraving tests. See the [VexTab 6 qualification record](../issues/200/README.md) for phone, screen reader, SVG/Canvas, PDF and timing checks.

The browser suite checks real SoundFont output from the offline guide. Keep the SpessaSynth library and worklet on the same pinned version. The guide bank and its provenance live in `guide/audio/`.

Edit tutorial chapters and their fixed-layout examples in `doc/tutorial.html`. The historical page and the guide share this source. Edit feature chapters in `guide/features.html`, API entries in `guide/reference.html`, and study descriptions and the notation glossary in `guide/catalog.ts`. Preserve the chapter and entry IDs for incoming links. Use stable score IDs for guide, playground and original-source links. Edit the study music in `guide/scores/*.vextab`. The guide and engraving tests import the same files. The suite exercises both scores at 360 and 960 CSS pixels, including a return to the starting width after fonts load. [Guitar and lead-sheet coverage](vt5-m3.md)

To test the package a consumer will download, build a tarball and run the consumer tests against that archive. GitHub Actions performs this check on pushes, pull requests, and release tags.

```sh
package_dir=$(mktemp -d)
npm pack --pack-destination "$package_dir"
tar -xzf "$package_dir"/vextab-*.tgz -C "$package_dir"
node issues/212/host-package.mjs "$package_dir/package"
node scripts/test-consumer.mjs "$package_dir"/vextab-*.tgz
```

The consumer check installs the local tarball into a temporary project. It exercises CommonJS and ES parser imports, compiles a strict TypeScript example, bundles it and opens it in Chrome.

After building production bundles, run `npm run test:baseline` to compare the musical fixtures with VexTab 4.0.6. The [M0 baseline](vt5-baseline.md) covers the scores, known failures and visual references.

## Release a version on GitHub

1. Check the GitHub tags and the latest npm version. Choose an unused stable version. Set `release_version` to that number.
2. Update both manifests, commit the change on `master`, and push. Wait for the CI run on that commit to pass.
3. Create an annotated numeric tag on the tested commit. The tag annotation becomes the public release notes. Include the user-facing changes and any migration instructions.

```sh
gh release list
git ls-remote --tags --refs origin
npm view vextab version
read -r release_version
npm version "$release_version" --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release VexTab $release_version"
release_commit=$(git rev-parse HEAD)
git push origin master
gh run list --workflow ci.yml --commit "$release_commit"
```

After CI passes, push the tag and follow its Actions run:

```sh
git tag -a "$release_version" "$release_commit"
git push origin "refs/tags/$release_version"
gh run list --workflow ci.yml --branch "$release_version"
gh release view "$release_version"
```

The tag workflow checks that the tag matches the package version. It tests the packed files, computes SHA-256 checksums, and publishes the tarball, browser script, legacy stylesheet, and `SHA256SUMS` to [GitHub Releases](https://github.com/0xfe/vextab/releases). The automatic source archives contain the source checkout. Download the attached `.tgz` for the built npm package.

## Publish the verified tarball to npm

Set `release_version` to the published GitHub tag. Download the assets into an empty directory and verify their checksums.

```sh
download_dir=$(mktemp -d)
gh release download "$release_version" --repo 0xfe/vextab --dir "$download_dir"
(cd "$download_dir" && shasum -a 256 -c SHA256SUMS)
```

Use an npm account with publishing access to `vextab`. Complete any two-factor prompt. Publish the verified file and check the registry:

```sh
npm whoami
npm publish "$download_dir/vextab-$release_version.tgz" --access public --tag latest
npm view "vextab@$release_version" version dist.integrity
```

## Upgrading browser embeds from 6.x

Replace the old `main.prod.js`, `div.prod.js` or `vextab-div.js` tag with the two pinned jsDelivr tags in the [README](../README.md). The full VexFlow build includes the fonts for both Bravura and Petaluma. Keep both files locally for offline embeds. The VexTab script mounts modern and legacy markup and exposes both browser globals.

npm callers can keep using `vextab/browser`, `vextab/auto`, `vextab/parse` and `vextab/performer`. Switch imports from `vextab-import/<format>` to `vextab/import/<format>`. VexTab 7 installs VexFlow once as its runtime dependency. Use `import VexFlow from "vexflow"` in an ES module. An app that mixes CommonJS and ES modules can use the `Vex` export from `vextab/browser` to access the exact engine instance used for engraving. Readers can run in Node and browser workers without loading the engraving engine.

Development bundles, source maps, tests and examples live in the source checkout. To debug the shipped runtime, check out its release tag, run `npm ci` and `npm run build:runtime -- --sourcemap`. A normal `npm pack` rebuilds the production files.
