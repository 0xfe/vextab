# Security

## Reporting a vulnerability

Email the maintainer at [mohit@muthanna.com](mailto:mohit@muthanna.com). Include the VexTab version or commit, the affected entry point, and the impact. Please keep sensitive details in the private report.

## How VexTab handles scores

VexTab parses notation and draws SVG or Canvas in the host page. Webpack compiles the repository's grammar at build time. The editor and playground display parser errors as text. When embedding a score from another user, assign it with `textContent` or a textarea's `value`.

The optional player uses MIDI.js, Paper.js, and soundfonts supplied by the host application. The host controls their versions and where the player loads soundfonts.

## Dependency and build checks

- npm installs exact direct dependencies and resolves transitive dependencies from `package-lock.json`. Run `npm ci` and `npm audit` to check the full tree, including build tools.
- GitHub Actions runs lint, TypeScript checks, browser tests, and the production build. The workflow has read-only repository access and pins actions to full commit SHAs.
- Dependabot checks npm packages and GitHub Actions weekly. Fixes in the repository reach npm consumers when a maintainer publishes a new release.

## Known limitations

- Parsing and rendering run synchronously. VexTab has no built-in limit on score length, stave count, or render dimensions. Applications accepting public submissions should bound these inputs.
- The npm audit covers registry dependencies. Host-supplied playback scripts and soundfonts need separate review.
- At the November 18, 2026 review, GitHub Code Quality was unavailable for this repository, CodeQL default setup was unconfigured, and secret scanning was disabled.
