# Milestone 5 qualification

On November 20, 2026, the converted corpus passed against the packed opt-in candidate built from `grammar-v2-development` at `105894a` plus the four-string clef correction. The tarball identifies itself as VexTab 5.0.0 with VexFlow 5.6.0. Its SHA-256 is `bb2e5cd1952752133caa0c5b58da86c652ddecbe3acd8d5f7a9241fea7d92418`.

| Check | Result |
| --- | --- |
| Corpus and migration | All 88 authored scores compiled with v2. Migration checks, lint and TypeScript passed. |
| Packed guide, demos and embeds | Chrome 157, Firefox 159 and WebKit 27.2 each passed 121 QUnit cases, 15 standalone parser cases and the browser interaction checks. These exercise responsive editing, stale previews, source selection, playback, print and part extraction. |
| Musical baseline | All nine probes passed on the candidate. All 28 VexTab 4.0.6 examples matched their expected score, backend and visible ink. The candidate runs 30 examples, including the two tutorial additions. |
| Fresh install | The packed tarball passed standalone CommonJS and ESM parsing, strict TypeScript, bundling, the migration CLI, manual mounting and playback-adapter checks. |

Four-string TAB clefs now fit between the **inner edges** of the outer rules on both screen and published staves. This accounts for the rule width when browsers round glyph ink differently. Firefox also revealed a test race when print reflow replaced a sheet between locating it and reading its style. The check now samples the current sheet inside a single browser task and asserts black ink on white paper in both media. [Upstream clef issue](https://github.com/vexflow/vexflow/issues/373)

The [CI workflow](../../.github/workflows/ci.yml) runs these checks on the unpacked distribution. At this milestone, pass `{ language: 2 }` to `parseScore`, or set `data-language="2"` on an embed. The [migration guide](../../docs/migrate-scores.md) explains how to convert an existing score and review changes.

## VexTab 6.0.0 candidate with v2 as the default

The unversioned entry points read the same downloaded first-fret lesson. A fresh npm project compiled strict TypeScript, bundled the browser API, rendered the lesson, played its first MIDI pitch (64), and selected `0/1` in the editor. The CommonJS and ESM parser imports and installed migration command passed. The production browser globals also rendered v2, and malformed v2 reported the correct source location.

The candidate compiled 88 authored scores. Chrome, Firefox and WebKit each passed 124 browser cases plus the guide interaction checks. The historical comparison exercised 28 examples per build. Tablature now hides stems by default on screen and in independent parts. [Before and after examples](https://github.com/0xfe/vextab/issues/182#issuecomment-7050120900)

After the mainline merge and release, repeat the installed-consumer check against the published npm tarball, verify the GitHub release assets and check the hosted guide and playground. These are the outstanding release checks for milestone 6.
