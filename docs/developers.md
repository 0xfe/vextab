# Build, test, and release VexTab

Run the commands from the repository root in Bash or Zsh.

## Local setup

Install Git, Google Chrome, and the Node.js version in `.nvmrc`. With nvm, run:

```sh
nvm install
nvm use
npm ci
```

The browser tests use the installed Chrome. To use another Chrome or Chromium executable, set `CHROME_BIN` to its full path.

## Build and develop

```sh
npm start
```

The development server watches the source. Open the [QUnit suite](http://127.0.0.1:9005/), the [triplet guide](http://127.0.0.1:9005/guide/#triplets), or the [interactive playground](http://127.0.0.1:9005/playground.html).

| Command | Output |
| --- | --- |
| `npm run build-dev` | Readable browser bundles and test pages in `dist/` |
| `npm run build` | Minified bundles, source maps, and the legacy `vextab-div.js` entry point |
| `npm run watch` | Development bundles rebuilt on source changes |
| `npm run clean` | Removes the generated `dist/` directory |

To browse the historical tutorial or the API demos, run `npm run build-dev` and `npm run serve`. Open the [tutorial](http://127.0.0.1:8052/doc/tutorial.html) or the [API demo](http://127.0.0.1:8052/demos/api.html).

## Test locally

```sh
npm audit
npm run lint
npm run typecheck
npm test
npm run build
```

Run these commands in order because the builds share `dist/`. The browser suite covers parsing, notation, the SVG playground, editor errors, and the legacy Canvas renderer.

To test the package a consumer will download, build a tarball and run the browser suite against its extracted files. GitHub Actions performs this check on pushes, pull requests, and release tags.

```sh
package_dir=$(mktemp -d)
npm pack --pack-destination "$package_dir"
tar -xzf "$package_dir"/vextab-*.tgz -C "$package_dir"
node scripts/test-browser.mjs "$package_dir/package/dist"
```

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

The tag workflow checks that the tag matches the package version. It tests the packed files, computes SHA-256 checksums, and publishes the tarball, standalone browser bundles, legacy stylesheet, and `SHA256SUMS` to [GitHub Releases](https://github.com/0xfe/vextab/releases). The automatic source archives contain the source checkout. Download the attached `.tgz` for the built npm package.

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
