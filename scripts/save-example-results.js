// Run with OPENROUTER_API_KEY in the ignored .env file. Existing matching runs are reused.
import { examples } from '../public/examples.js';
import { compareWithJev, validateJevResponse } from '../public/compare.js';

const apiKey = process.env.OPENROUTER_API_KEY;
const output = new URL('../public/example-results.json', import.meta.url);
const saved = await Bun.file(output).exists() ? await Bun.file(output).json() : [];
const results = [];
for (const example of examples) {
  const existing = saved.find(run => JSON.stringify(run.request) === JSON.stringify(example.request));
  if (existing) {
    validateJevResponse(example.request, existing.jev);
    results.push({ ...existing, title: example.title });
    console.log(`Reused: ${example.title}`);
  } else {
    if (!apiKey) throw new Error('Set OPENROUTER_API_KEY in .env before recording missing examples.');
    const { jev } = await compareWithJev(example.request, apiKey, AbortSignal.timeout(30_000));
    if (!jev) throw new Error(`No JEV response for ${example.title}`);
    const run = { title: example.title, recordedAt: new Date().toISOString(), request: example.request, jev };
    saved.push(run);
    results.push(run);
    // Save each successful call so an interrupted batch can resume without paying twice.
    await Bun.write(output, JSON.stringify(saved, null, 2) + '\n');
    console.log(`Recorded: ${example.title}`);
  }
}
await Bun.write(output, JSON.stringify(results, null, 2) + '\n');
console.log(`Saved ${results.length} real JEV responses.`);
