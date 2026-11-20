# Make grammar v2 the default for VexTab

A musician should be able to copy a score from the guide into a plain VexTab embed, hear it, print a part, and edit it using the same language throughout. The final milestone makes v2 the default in every public entry point. Until that milestone, v2 is an explicit preview. The [language proposal](grammarv2.md) explains the syntax and links to the exploratory prototype.

## 1. Agree on the language and inventory the scores

The [migration inventory](../issues/182/inventory.md) identifies the existing sources and acceptance checks. The [editing tasks](../issues/182/editing-tasks.md) are ready for musician review.

- Try four editing tasks with a guitarist and a pianist. Enter a first phrase, finger a chord, edit one voice independently, and reuse a phrase across bars. Use their mistakes and edits to settle the syntax.
- Inventory authored scores and syntax assumptions in the README, `docs/`, historical tutorial in `doc/`, guide lessons and score assets, demos, HTML embeds, playgrounds, test fixtures, scripts, and package consumer examples. Include scores embedded in TypeScript, Markdown and HTML, plus maintained website content.
- Record each feature, a representative score, and its expected behavior in fixed SVG/Canvas, responsive engraving, printed parts, playback and reading navigation wherever it applies. Include landed work and pending score features such as grand staffs and per-head marks. Record intended major-version changes explicitly.

**Done when** every maintained surface has a migration target and each current feature has a verifiable musical or visual expectation.

## 2. Build an opt-in parser and shared score model

- Implement the grammar against one typed model for parts, staves, voices, measures, attacks, heads and spans. Preserve exact musical time, authored spelling, source ranges, and the origin of each expanded event.
- Support scoped durations, named patterns, finite repetition and tuplets. Validate measure alignment, reject recursive pattern calls, and bound parsing and expansion work, including repeated empty patterns. Report the source of an error in the editor.
- Make selection explicit during preview. Exercise the parser through library and browser entry points. Keep ordinary calls on their existing default until milestone 6.

**Done when** the proposal's runnable scores pass through the real parser, and valid, invalid and resource-limit fixtures agree on timing and source locations.

## 3. Reach feature parity across rendering, playback and editing

The [parity ledger](../issues/182/parity.md) records the comparison scores and the limits of each output surface.

- Connect the shared model to fixed SVG/Canvas, responsive scores, printed scores and individual parts, the playback plugins, and reading navigation. Carry source identity across reflow, part extraction and repeated passages.
- Exercise a two-hand piano passage, a polyphonic guitar score, tuned/capoed tab, per-head fingerings and accidentals, bends and open slides, a drum groove, lyrics, tuplets and repeat endings. Cover the rest of the inventory with smaller fixtures.
- Compare observable results with the existing grammar. Check pitches, onsets, durations, chord membership, rests and ties, then compare glyph placement, stave alignment, repeat boundaries and hit targets. Review representative engraving changes side by side.

**Done when** each existing feature has passing coverage for the surfaces that support it, or a documented major-version change with a reviewed replacement. The capability inventory identifies which additional VexFlow features can be added later.

## 4. Convert the complete VexTab corpus

- Provide a migration tool for existing VexTab scores. Read the old semantics, emit v2, and report ambiguous constructs at their source. Give authors a preview of edits. This tool's input is VexTab.
- Convert every inventoried lesson, tutorial, snippet, example, demo, default editor score, embed, test and package sample. Rewrite the surrounding prose, syntax reference, expected errors and editor hints. Regenerate distributed content from its authored sources.
- Preserve regression intent when replacing fixtures. Keep historical input only in explicitly identified migration or compatibility tests where reading that input is itself the behavior under test.
- Add a corpus check that extracts scores from the actual content, parses them, and catches new examples using the old syntax. Mark intentionally invalid teaching and diagnostic examples with the error they should produce.

**Done when** the inventory is accounted for and every maintained teaching example and ordinary regression test uses v2. A reader following the guide encounters one language from the first lesson to the reference.

## 5. Qualify the migrated release candidate

- Run lint, type checking, browser tests, musical baselines and production builds. Run the guide and display checks on their supported browsers. Exercise actual guide edits, invalid input, playback highlighting, responsive resizing, source selection, printing and hand/voice extraction.
- Use the same scores to compare musical results across the migration. Check independent snapshots for engraving changes. Investigate differences before updating expectations.
- Exercise the output of `npm pack` from a clean consumer project. Check CommonJS, ESM, TypeScript and browser embeds, along with packaged examples, demos and the built guide. Exercise v2 explicitly in these checks before the default changes.

**Done when** the converted corpus, browser checks and packaged consumer tests pass, and reviewed differences and any migration instructions are recorded in the release notes.

## 6. Switch the default and verify it end to end

- In the new major release, make unversioned parser calls, public library APIs, browser bundles, automatic embeds, demos, playgrounds and the guide use v2. Document how existing authors migrate and the support status of any explicitly selectable legacy reader.
- Rerun the full qualification suite with version selectors omitted. Copy the same guide score into a minimal embed and a clean package consumer. Verify rendering, playback and source selection. Malformed v2 must produce a v2 diagnostic.
- At release time, repeat the consumer smoke test against the published package and open representative examples on the hosted guide. Verify the package, release downloads and site describe the same default.

**Done when** a fresh install and the published guide both use v2 without configuration, all migrated content passes, and the verified release is available to users.
