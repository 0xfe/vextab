# Security

## Reporting a vulnerability

Email the maintainer at [mohit@muthanna.com](mailto:mohit@muthanna.com). Include the VexTab version or commit, the affected entry point, and the impact. Please keep sensitive details in the private report.

## How VexTab handles scores

VexTab parses notation and draws SVG or Canvas in the host page. Webpack compiles the repository's grammar at build time. The editor and playground display parser errors as text. When embedding a score from another user, assign it with `textContent` or a textarea's `value`.

The guide stores edited source in local browser storage and falls back to memory when storage is disabled. Example links contain a score ID. Saved files and clipboard copies contain the current source. Flow requires complete measures unless the author declares a pickup or fragment. This validation does not bound resource use.

The built-in player synthesizes its preview with Web Audio. The guide bundles its pinned SpessaSynth worklet and a public-domain SoundFont and loads them on Play. Other hosts using the adapter supply their own synth, worklet and bank. A legacy MIDI.js host supplies its own scripts and soundfonts.

## Dependency and build checks

- npm installs exact direct dependencies and resolves transitive dependencies from `package-lock.json`. CI audits the four independent lockfiles for the host, importer, report tools, and qualification tools in `issues/206`. To repeat an audit, run `npm audit` in the corresponding directory.
- GitHub Actions runs lint, TypeScript checks, browser tests, and the production build. Builds and tests have read-only repository access. The job that publishes a version tag to GitHub Releases has write access to repository contents. All actions are pinned to full commit SHAs.
- Dependabot checks npm packages and GitHub Actions weekly. Fixes in the repository reach npm consumers when a maintainer publishes a new release.

## Review on November 24, 2026

Five Dependabot alerts (#278–282) identified minimatch in the report tools. The historical QUnit runner now resolves minimatch 3.1.5 and the TypeScript report parser resolves 11.0.9. All four lockfiles passed npm audit. The historical VexTab 4.0.0 report ran all 39 browser cases with the patched dependency.

## Known limitations

- Parsing and rendering run synchronously. Grammar v2 enforces compiler budgets, including source, event and token limits. Applications accepting public submissions should also limit legacy inputs and render dimensions. [Grammar v2 budgets](https://github.com/0xfe/vextab/blob/master/src/score/grammar2/capacity.mts)
- The npm audit covers registry dependencies. Host-supplied playback scripts and soundfonts need separate review.
- At the November 24, 2026 review, GitHub Code Quality was unavailable for this repository, CodeQL default setup was unconfigured, and secret scanning was disabled.
