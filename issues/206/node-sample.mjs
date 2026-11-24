// Measure one cold conversion in a fresh Node process without loading any benchmark drivers.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Child-process high-water RSS includes module loading, input and scanning, above the post-input baseline. */
async function nodeSample(entry, file, emit) {
  const bytes = readFileSync(file);
  const before = process.resourceUsage().maxRSS;
  const start = performance.now();
  const { probe } = await import(pathToFileURL(entry));
  const loaded = performance.now();
  const result = probe(bytes, emit);
  const end = performance.now();
  console.log(JSON.stringify({ load: loaded - start, run: end - loaded, result,
    peakRSSMiB: process.resourceUsage().maxRSS / 1024, growthMiB: (process.resourceUsage().maxRSS - before) / 1024 }));
}

await nodeSample(process.argv[2], process.argv[3], process.argv[4] === 'true');
