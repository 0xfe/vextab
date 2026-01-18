# Repository Guidelines

## Project Structure & Module Organization
- `src/`: Core implementation in TypeScript. Rendering lives under `src/artist/`, parsing under `src/vextab/`, entry points are `main.ts`, `div.ts`, and `player.ts`, with grammar in `vextab.jison` and styles in `vextab.css`.
- `tests/`: QUnit test runner (`tests.html`) and suite (`tests.ts`), plus a manual playground (`playground.html`, `playground.ts`).
- `static/`: Static assets copied into builds.
- `doc/`: Project documentation and notes.
- `dist/`: Build output (generated). `releases/` holds versioned release bundles.

## Build, Test, and Development Commands
- `npm install`: Install dependencies.
- `npm start`: Run webpack-dev-server on port 9005; open `http://localhost:9005` for tests and `http://localhost:9005/playground.html` for manual checks.
- `npm run build`: Produce production bundles in `dist/`.
- `npm run build-dev`: Produce development bundles.
- `npm run watch`: Rebuild on changes.
- `grunt lint`: Run ESLint across the codebase.
- `grunt build`: Build both prod/dev webpack bundles.
- `npm run clean`: Remove `dist/*`.
- `npm run serve`: Serve built assets on port 8052.

## Coding Style & Naming Conventions
- TypeScript uses 2-space indentation; keep class names PascalCase and methods camelCase.
- ES modules everywhere. ESLint uses the flat config in `eslint.config.cjs` with `@typescript-eslint` rules and a 180-char max line length; webpack runs ESLint with auto-fix where possible.
- Keep filenames lowercase and descriptive. Grammar changes live in `*.jison`, CSS in `vextab.css`.
- Prefer small, focused methods and guard debug logs with existing `DEBUG` flags.

## Testing Guidelines
- Tests are QUnit-based and run in the browser. Main suite: `tests/tests.ts` + `tests/tests.html`.
- Run `npm start` and verify test results in the browser; visual correctness matters for notation rendering.
- Add tests for new behavior and confirm the playground (`playground.html`) renders the change correctly.

## Commit & Pull Request Guidelines
- Commit messages are short and descriptive; dependency updates commonly use `Bump <pkg> from <x> to <y>`.
- PRs should include a clear description, linked issue (if any), and notes on test/visual verification (tests page + playground).
- Include screenshots/GIFs when rendering output changes.

## Release Notes (Maintainers)
- Release tasks are handled via Grunt (`grunt publish`) after updating dependencies and verifying builds.
