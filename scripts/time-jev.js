// Times real Jev calls for every built-in example and reports latency and cost.
// Run with OPENROUTER_API_KEY in the ignored .env file: bun scripts/time-jev.js
// About 30 requests at fractions of a cent in total.
import { examples } from '../public/examples.js';
import { jevCost } from '../public/compare.js';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('Set OPENROUTER_API_KEY in .env first.');
const runs = [];
for (const example of examples) {
  const started = performance.now();
  const response = await fetch('https://openrouter.ai/api/v1/systemone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'X-OpenRouter-Title': 'reverse.horse' },
    body: JSON.stringify(example.request), signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  const ms = performance.now() - started;
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${example.title}: ${JSON.stringify(body)}`);
  const chars = JSON.stringify({ state: example.request.state, questions: example.request.questions }).length;
  runs.push({ title: example.title, ms, chars, usage: body.usage, estimate: jevCost(example.request) });
  console.log(`${ms.toFixed(0).padStart(5)} ms  ${JSON.stringify(body.usage)}  ${example.title}`);
}
const sorted = runs.map(run => run.ms).sort((a, b) => a - b);
const at = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(0);
console.log(`\nRound trip: min ${at(0)} ms · median ${at(0.5)} ms · p90 ${at(0.9)} ms · max ${at(1)} ms`);
const costed = runs.filter(run => Number.isFinite(run.usage?.cost));
if (costed.length) {
  const ratio = costed.reduce((sum, run) => sum + run.usage.cost / run.estimate, 0) / costed.length;
  console.log(`Actual cost / jevCost estimate: ${ratio.toFixed(2)} (1.00 means the estimate is right)`);
}
// Least-squares fit of input tokens = fixed + chars / perToken, for jevCost.
const fit = runs.filter(run => Number.isFinite(run.usage?.input_tokens));
if (fit.length > 1) {
  const n = fit.length, mx = fit.reduce((s, r) => s + r.chars, 0) / n, my = fit.reduce((s, r) => s + r.usage.input_tokens, 0) / n;
  const slope = fit.reduce((s, r) => s + (r.chars - mx) * (r.usage.input_tokens - my), 0) / fit.reduce((s, r) => s + (r.chars - mx) ** 2, 0);
  const worst = Math.max(...fit.map(r => Math.abs(my + slope * (r.chars - mx) - r.usage.input_tokens)));
  console.log(`Input tokens ≈ ${(my - slope * mx).toFixed(0)} + chars / ${(1 / slope).toFixed(2)} (worst miss ${worst.toFixed(0)} tokens)`);
}
