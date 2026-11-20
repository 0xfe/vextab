# Security

## Reporting a vulnerability

Email the maintainer at [mohit@muthanna.com](mailto:mohit@muthanna.com). Include the VexTab version or commit, the affected entry point, and the impact. Please keep sensitive details in the private report.

## How VexTab handles scores

VexTab parses notation and draws SVG or Canvas in the host page. Webpack compiles the repository's grammar at build time. The editor and playground display parser errors as text. When embedding a score from another user, assign it with `textContent` or a textarea's `value`.

The guide stores edited source in local browser storage and falls back to memory when storage is disabled. Example links contain a score ID. Saved files and clipboard copies contain the current source. Flow requires complete measures unless the author declares a pickup or fragment. This validation does not bound resource use.

The built-in player synthesizes its preview with Web Audio. Hosts using the SpessaSynth adapter supply the synth, worklet and sound bank. A legacy MIDI.js host supplies its own scripts and soundfonts.

## Dependency and build checks

- npm installs exact direct dependencies and resolves transitive dependencies from `package-lock.json`. Run `npm ci` and `npm audit` to check the full tree, including build tools.
- GitHub Actions runs lint, TypeScript checks, browser tests, and the production build. Builds and tests have read-only repository access. The job that publishes a version tag to GitHub Releases has write access to repository contents. All actions are pinned to full commit SHAs.
- Dependabot checks npm packages and GitHub Actions weekly. Fixes in the repository reach npm consumers when a maintainer publishes a new release.

## Review status on November 18, 2026

GitHub marked all 71 Dependabot alerts as fixed. The full npm audit reported zero known vulnerabilities in the lockfile.

The latest published npm package at review time was VexTab 4.0.5. Its editor can interpret parser errors as HTML. Applications accepting untrusted scores should use the rebuilt bundles from commit [2400329](https://github.com/0xfe/vextab/commit/240032925b8e20cfd4abc344230aa48e1d912168) or a subsequent release containing that fix.

## Known limitations

- Parsing and rendering run synchronously. VexTab has no built-in limit on score length, stave count, or render dimensions. Applications accepting public submissions should bound these inputs.
- The npm audit covers registry dependencies. Host-supplied playback scripts and soundfonts need separate review.
- At the November 18, 2026 review, GitHub Code Quality was unavailable for this repository, CodeQL default setup was unconfigured, and secret scanning was disabled.
