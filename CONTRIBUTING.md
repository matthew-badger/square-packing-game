# Contributing

Bug reports, corrections and translations are welcome. By sending a change (an issue,
a pull request or a filled-in review workbook) you agree that it is released under the
project's MIT License.

## Reporting a problem

Open an issue on GitHub. For a problem with a particular puzzle, include its side lengths:
the address bar shows them after `#`, for example `#19.16.13.12.10.9.8`.

## Reviewing a translation

Five translations are drafts that no native speaker has checked yet: Spanish (neutral
Latin American, as used in Mexico), French, Brazilian Portuguese, Hindi and Simplified
Chinese. The game is written for a general audience, so plain, friendly wording matters
more than technical precision, except in the Advanced answer panel. The menu marks each one as a draft in
its own language.

There are two ways to review one.

- **Workbook (no programming).** Ask for the workbook for your language, or make it with
  `node tools/review_sheets.js && python3 tools/review_sheets.py` (it lands in
  `release/review/`). The first sheet explains what to do: each row is one piece of text
  with its English original, the draft and a note on where it appears; write corrections in
  the yellow columns only. Send the workbook back by email or attach it to an issue.
- **Pull request.** Edit `src/lang/<code>.js` directly. Keep everything in `{curly braces}`
  and every HTML tag (`<kbd>`, `<sub>`) as it is. Mathematical notation (L\*, s₀, s₁, the
  Greek strategy names α to ψ) stays unchanged. Then run `node test/i18n.test.js`, which
  checks that every key is present and that every answer and hint renders.

When a native speaker has approved a language, set `reviewed: true` at the end of its file.
The draft label then disappears from the menu and the About section, and the reviewer is
credited in the README.

## Adding a language

Copy `src/lang/fr.js` to `src/lang/<code>.js`, translate every value (the English
reference is the `en` table in `src/i18n.js`) and add a `<script>` line for it in
`src/page.html`. Use `I.plural('<code>')` for counts, and set `list.sep` and `list.and`
for joining names.

## Code

The game has no dependencies. `node build.js` writes `docs/index.html`; `npm test` runs a
quick pass of the test suites (about 30 seconds). Before a release, run `npm run test:full`:
larger sweeps of the same suites, plus `test/formula.test.js`, which needs
`test/fixture_L8.json`, made from the independent L\*₈ verification script with
`python3 test/make_fixture.py path/to/verify_L8_general.py` (about 90 MB, so it is not kept
in the repository).
