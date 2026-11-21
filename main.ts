// Driver the harness runs: `node main.ts` on Node 22.
//
// Reads every case from /input/cases.json (a JSON array of {id, input}),
// answers each one on its own with run() from solve.js, and writes the
// answers, one per case and in the cases' order, to /output/answers.json.
// Outside a container, MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in
// for /input and /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off, set before solve.js is imported so all of
// its work runs under it, as the house baseline's driver does.
setFlagsFromString('--no-incremental-marking');

// solve.js, imported by its URL (a .js module carries no types) and typed by
// its contract: run(input) returns csv-reader 1.0.0's answer for that input.
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8')) as {
  id: string;
  input: unknown;
}[];

// Sized up front: the answer count is known, so no growth while filling it.
const answers: unknown[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) answers[i] = run(cases[i]!.input);

writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
