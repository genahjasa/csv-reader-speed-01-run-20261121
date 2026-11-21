[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/genahjasa/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/genahjasa/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)

# Faster csv-reader

A faster drop-in for make.fun's own csv-reader 1.0.0, written for the
[make.fun competition](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
"Read broken CSV files faster, 21 November 2026". `solve.js` answers every
case exactly as csv-reader 1.0.0 does — same `{columns, rows, errors}`,
including every broken-row error (`stray_cr`, `quote_junk`,
`unterminated_quote`, `short_row`, `long_row`) — and `main.ts` is the program
the harness runs, reading `/input/cases.json` and writing
`/output/answers.json`.

## How it is faster

The reference reader grows every field one character at a time. This one
never does that for plain text:

- **Slice, don't grow.** A field is remembered by where it starts and cut out
  with a single `slice` when it ends, so an unquoted field costs one
  allocation instead of one string join per character.
- **Split plain lines whole.** A record whose line holds no quote and no
  stray carriage return is split on commas in one native call.
- **Stitch only the broken pieces.** Doubled quotes, carriage returns inside
  quotes, stray CRs and junk after a closing quote are the rare paths, and
  only those are assembled from segments.

Everything else follows the reference semantics: a U+FEFF at the very start
is dropped, records end at LF or CRLF, empty lines are no records, quoted
fields run to the next quote that is not doubled (with `""` reading as one
quote and CR/CRLF inside reading as LF), junk after a closing quote is
appended as it stands, a quote that never closes is a literal character with
the rest re-read as unquoted, and rows are padded or cut to the first
record's width.

## Layout

- `solve.js` — the parser: `run({text, header})` returns
  `{columns, rows, errors}`. Dependency-free ES module, no state kept
  between calls.
- `main.ts` — the driver: reads the cases, answers each with `run`, writes
  the answers. Runs on Node 22 and turns V8's incremental marking off
  before importing `solve.js`, as the house baseline's driver does.
- `LICENSE` — MIT.

## Check it locally

Run the entry on the kit's practice set and compare with the reference
answers; then time it against the house baseline on the same set.

Measured on this machine (Node 24.22.1, practice set of 6 cases, ~10.5 MB of
CSV), parse only, trimmed mean over 7 runs: the baseline takes 968 ms per
pass, this entry 132 ms — about 7.3x faster. End to end through `main.ts`
(including reading the cases and writing the answers), wall time is about
1.17 s against the baseline's 2.11 s, and the answers are byte-identical to
the baseline's. The kit scorer on the practice set reports
`{"passed": 1, "cases_passed": 6, "cases_total": 6}`.
