# M0 · Importer qualification

**Start M1 on VexTab 6.2.3 and VexFlow 5.9.0.** All three native controls work on screen and in an independently rendered part. M1 can implement the shared writer and two measured readers. M3 can start the opt-in capacity profile and timed staff state in parallel. None of these controls requires an upstream VexFlow fix. [Implementation strategy](../../doc/importer.md) · [Tracking issue](https://github.com/0xfe/vextab/issues/206)

## What belongs in each project

| Source fact | Read and write | Screen and print evidence | Playback and owner |
| --- | --- | --- | --- |
| Clef and key change between two attacks | Both readers must retain staff, onset and the written spelling on either side. Current VexTab can set a part clef and change a key at a bar boundary. M3 needs inline staff state in its grammar and projection. | Native declarative `{change: {clef: 'bass', key: 'G'}}` generated a `ClefNote` and a `KeySigNote`. The printed bass clef and sharp were both between the two heads. | VexTab must resolve subsequent written pitches in the new state. A clef alone does not transpose a sounding pitch. Add that assertion when M3 exposes the syntax. |
| Invisible dotted-half rest occupying 5/8 in 6/8 | The MusicXML reader owns written value, elapsed time and visibility as separate facts. VexTab can emit known silence as skips today. Retaining an independently specified written value needs grammar and projection work. | One EasyScore commit hook applied `setDuration(5/8)` and transparent ink before voice construction. It also ran in `Publication.noteHooks` when rebuilding the part. Two visible eighths aligned at exactly the same x in each view. Printed metadata retained 10,240 ticks at 16,384 ticks per whole note. | The owning voice must remain silent for 5/8, then enter with its partner. Verify the scheduler when the writer exposes this mapping. |
| Two independently anchored slurs with interleaved endpoints | Readers own endpoint identity. Intervals A–C and B–D cannot both be emitted as nested blocks. VexTab needs an endpoint spelling plus projection for overlapping spans. | Native continuous spans on opposite sides of the staff each produced a first and a last fragment over the forced break. Both IDs and all four fragments survived separate part pagination. | Visual slurs preserve the underlying attacks. No new playback tie should be introduced. |
| Complete quartet | Readers must size the selected document. VexTab owns the compiler, host opt-in and oversized-document diagnostic. | Default grammar compilation passed on the 42-bar adaptation and rejected the compact 10,014-event cardinality control. Full-score layout and pagination must be qualified in M3. | M3 must open the same large score in the editor, player and print path before the importer advertises the profile. |

The native checks draw the same authored score twice, first through EasyScore and then through a new Publication with the solo staff selected. The printed assertion reads notehead geometry, metadata and the actual inline glyphs. A Chromium PDF exported from outlined print HTML was rasterized and visually inspected. These controls establish the named notation cases. Unequal releases of two heads on one stem, same-side collision routing, arbitrary staff groups and microtonal playback still need their own controls before assigning an engine change. [Fixture source](native.mjs) · [Assertions](render.mjs)

## Input and capacity decisions

The [fixture manifest](fixtures.json) pins seven inputs by SHA-256 and records their origin, permissions, expected observations and scope. Files are fetched or read from the repository and kept out of the distribution. Target the MusicXML 4.0 final report, with a 3.1 compatibility lane. For LilyPond, pin the 2.26.0 regression distribution, record each file’s own declared language version, and qualify 2.24 and older sources individually. M2B’s semantic reference is native LilyPond 2.26.0 on reviewed fixtures. M0 measures lexical processing of the real Joplin file. [MusicXML specification](https://www.w3.org/2021/06/musicxml40/) · [LilyPond regression catalogue](https://lilypond.org/doc/v2.26/input/regression/collated-files.html)

| Haydn observation | Complete MXL rootfile | Theme and Variation I extract |
| --- | ---: | ---: |
| Score XML bytes | 4,231,200 | 320,405 |
| Measures per part, four parts | 531 | 42 |
| Note elements / timed records excluding grace and chord continuations | 10,593 / 10,014 | 798 / 784 |
| Grace / chord-continuation elements | 45 / 534 | 6 / 8 |
| Rest / backup / forward elements | 1,296 / 18 / 14 | 77 / 4 / 4 |
| Tie / slur / direction / tuplet elements | 350 / 2,416 / 442 / 818 | 0 / 246 / 40 / 2 |

The archive is 197,968 bytes. The excerpt retains auxiliary voices for the scanner. The independent VexTab adaptation has **772 principal events** in 9,155 bytes. The preparer prints the derived XML digests and feature counts. The compiler control expands a small rhythm pattern to the same number of events as the complete quartet and asserts `event-limit`. It tests the expansion ceiling independently of XML decoding, text size and token count. [Preparation](prepare.py) · [Independent musical comparator](../197/check-edition.py)

| Target budget | Current default | M3 opt-in target |
| --- | ---: | ---: |
| UTF-8 VexTab source | 64 KiB | 1 MiB |
| Tokens | 8,192 | 131,072 |
| Expanded events, including skips | 4,096 | 32,768 |
| Compiler work steps | 32,768 | 524,288 |

Keep nesting, per-chord, repetition and rational-arithmetic limits at their existing defaults until a fixture requires a change. The event ceiling provides about three times the quartet’s timed records, leaving room for additional voices and emitted skips. The text budget is about eight times the guide excerpt’s bytes per event scaled to 10,014 events. These are implementation targets requiring an end-to-end M3 measurement.

Use the default profile unless the caller explicitly requests the large profile **and** the consuming host supports it. Report required capacity and the failing dimension on overflow. Support explicit movement and part selection by stable source identity. Select before expansion where possible. Carry in active clef, key, meter, transposition and tempo at the selection boundary and diagnose unresolved crossing references. A smaller selection can succeed under the default limits. Never silently select a part, clip a piece, or raise a host’s budget from the input itself.

## Prototype measurements

Apple M3, macOS 27.0.1 arm64, Node 26.13.1, Chrome 157.0.8103.79, Playwright Core 1.65.1 and esbuild 0.28.2. Each latency row uses 21 fresh Node processes and 21 fresh Chrome worker realms. The operation clock starts after module import and ends when the in-memory result is available. Cold load excludes process/worker startup, fixture I/O and network transfer. The source files were verified before timing.

| Operation | Input bytes | Node ms, median / p95 | Worker ms, median / p95 | Node peak RSS growth, p95 MiB |
| --- | ---: | ---: | ---: | ---: |
| XML, emit 32 bars and 128 notes | 14,293 | 1.66 / 1.73 | 1.2 / 1.3 | 3.4 |
| LilyPond, emit the same 128 notes | 579 | 0.21 / 0.22 | 0.2 / 0.3 | 0.9 |
| XML, scan 32 bars with a second voice | 17,973 | 1.75 / 1.79 | 1.3 / 1.4 | 3.4 |
| LilyPond, tokenize 4,096 variable references | 28,705 | 1.07 / 1.11 | 0.5 / 0.6 | 4.5 |
| XML, scan all voices of the Haydn excerpt | 320,405 | 5.79 / 5.85 | 5.3 / 5.4 | 10.4 |
| XML, scan complete quartet | 4,231,200 | 34.17 / 34.33 | 34.6 / 34.8 | 12.4 |
| MXL, locate rootfile, inflate and scan complete quartet | 197,968 | 55.10 / 56.73 | 52.6 / 53.8 | 23.2 |
| LilyPond, tokenize Joplin piano score | 10,361 | 0.94 / 0.96 | 0.5 / 0.6 | 3.9 |

Both controlled 32-bar emitters produced the same VexTab text, which reparsed to 128 expected events outside the timing interval. The real-score XML probe counts while streaming UTF-8 through saxes in 16 KiB chunks. The MXL probe extracts the declared member with fflate. These use trusted, digest-pinned inputs. The LilyPond probe counts tokens without expanding variables. Repertoire parsing, expression evaluation, loss reporting, source maps, emission and reparse will add costs to a production conversion.

Node memory is the process high-water RSS increase above its pre-import high-water mark after input allocation. Absolute p95 process peaks were 68.3 MiB for raw quartet XML and 75.2 MiB for MXL. In a separate Chrome run we sampled total renderer RSS during 21 consecutive scans in one worker. Observed growth was 19.0 MiB for the excerpt, 25.5 MiB for full XML, 88.5 MiB for MXL and 14.5 MiB for Joplin. These OS samples include runtime and worker overhead and can miss brief peaks. They are useful for comparing runs on this runner.

| Independent browser entry | Minified bytes | Gzip bytes | Cold import p95, Node / worker, ms | M1–M2 gzip ceiling |
| --- | ---: | ---: | ---: | ---: |
| MusicXML with saxes 6.0.0 and xmlchars 2.2.0 | 29,352 | 8,493 | 1.12 / 1.3 | 32 KiB |
| MXL with XML reader and fflate 0.8.3 | 35,360 | 11,421 | 2.20 / 2.2 | 40 KiB |
| LilyPond lexer | 407 | 333 | 0.22 / 0.4 | 24 KiB |

Cold-import figures use the full quartet, MXL and Joplin rows respectively. A private sizing tarball containing all three bundles and a package manifest measured **15,899 bytes packed and 65,408 bytes of installed file contents**. All three exports loaded in a fresh offline consumer. The esbuild input graph confirms fflate appears only in MXL, saxes only in the XML-reading entries, and VexFlow in none. The sizing tarball models a fully bundled delivery. Production types, notices, diagnostics and licensing files will increase its size.

### Budgets for the first real importer

- **Package.** Start with one optional package and three subpath exports. Keep the ordinary VexTab production graph free of importer modules. Budget 96 KiB for the tarball and 320 KiB for installed payload including runtime dependencies. Use the per-entry gzip ceilings above. Measure a packed clean consumer before changing the package split.
- **Latency.** On this runner, target p95 cold module import under 10 ms per entry and full source-to-text conversion under 25 ms for the paired 32-bar cases. Budget 100 ms for the excerpt, 500 ms for the complete raw quartet, and 750 ms from MXL. For the Joplin print-score profile, target 100 ms once its syntax is supported. Time public reparse separately. These targets reserve time for exact clocks, output and diagnostics. The full-score gates become applicable when M3 delivers host capacity.
- **Memory.** Budget at most 64 MiB Node peak growth and 128 MiB sampled Chrome renderer growth for full quartet conversion in a worker with optional source maps off. Keep the input resident before the baseline. Report source maps on as a separate run. Investigate a reproducible increase above 15% on a comparable runner, even when inside an absolute ceiling.
- **Correctness.** M1 must assert exact rational events for the two-voice design example. M2A must match the 772 principal events and separately report graces and auxiliary voices. M2B must compare resolved pitch, duration and context with native LilyPond on reviewed fixtures. A fast scan alone cannot satisfy either reader milestone.

## Reproduce

Run from the repository root with the Node version in `.nvmrc`, Python 3 and a local Chrome installation. Only the issue package installs the experimental XML and ZIP dependencies. Generated measurements, inputs, the private sizing tarball and the images go under `build/importer-m0/`.

```sh
npm ci
npm ci --prefix issues/206 --ignore-scripts
python3 issues/206/prepare.py
node issues/206/bench.mjs
node issues/206/memory.mjs
node issues/206/package-size.mjs
node issues/206/render.mjs
```

`benchmark.json` contains component timings, corpus observations, the dependency graphs and compiler limits. `memory.json` contains renderer baselines and sample counts. The memory sampler uses macOS/Linux `ps`. `native.json`, `screen.png` and `part.pdf` contain the engraving observations. Open the first PDF page to inspect the printed glyphs, simultaneous eighth notes and all four slur fragments.
