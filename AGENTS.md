# VexTab repository guidance

## GitHub Comments

Whenever you make a comment (to an issue or PR or any such), start the comment with a line like so:

Beep Boop. This is __MODEL__ (__REASONING__) on (__HARNESS__) speaking.

For example:

Beep Boop. This is Astra 6.0 (xhigh) on Codex speaking.

## GitHub Issues

If addressing GitHub issues, first:

- Do an initial assessment, and post an update around what you observed, and your initial plan
- Assign the issue to me, label as in progress.
- Fix the issue
- Post another update after the work is committed and pushed.
- Otherwise, just post an issue with the work is done.
- If successful, close the issue.

Where relevant, if there are visual implications, attach some before/after screenshots with a couple of representative examples. Attach to the issue, not into the commit. Screenshots should have a white background, not transparent. Use the `--attach` flag of `gh` for this.

GitHub comments should be short and easy to read with simple sentences, but do include detail where necessary. Try and stick to the documentation guidelines below.

Keep any issue-specific files (like repro tests or notes) in the issues/ directory. Use this only when needed.

If an issue is labeled ai_todo, remove it after completion.

### Issue Triaging

If I ask you to triage issues, then go through all open issues and assign a priority and a type (bug/feature/etc.) and any relevant labels (if necessary). Also add a "triaged" label, and a short comment with any further thoughts/observations/next steps. Mention that you're a bot.

## Dependencies

- In general, we try to minimize external runtime dependencies.
- Prefer the language/platform standard library and small, readable local implementations.
- Remove dependencies when doing so is simpler and safer than retaining them.
- Use well-known, trusted, maintained packages when a dependency earns its complexity.
- Do not implement cryptography or complex security protocols from scratch to reduce dependencies.
- Pin toolchains and lock dependencies. Review updates; avoid forced bulk fixes and unexplained overrides.

## Code readability

- Write for human understanding, debugging, audit, and interpretation. This means clear simple comments, clear readable code.
- Comment constants, functions, methods, structs, interfaces, and other significant declarations.
- Explain intent, invariants, failure behavior, and non-obvious decisions.
- Split long functions into named steps (or shorter functions.) Clearly comment complex blocks that remain.
- Prefer explicit control flow, descriptive names, and straightforward data structures.
- Add a short file header describing the contents of each new or substantively changed source file.
- Keep generated/vendor assets clearly identified; do not manually annotate generated code.

## Documentation

- Keep documentation clean and human readable. The README.md should remain high-level, with pointers to docs/ as needed.
- Use short sentences, bullets, tables, code blocks, and concrete examples.
- Put detailed setup, architecture, testing, security, and deployment notes in `docs/`.
- Avoid long prose paragraphs and duplicated instructions.
