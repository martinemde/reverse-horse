import { expect, test } from 'bun:test';
import { examples } from './public/examples.js';
import results from './public/example-results.json';
import { validateRequest } from './public/protocol.js';
import { validateJevResponse, matchesJev } from './public/compare.js';
import { comparisonEnabled, setComparisonEnabled } from './public/auth.js';

test('every built-in example has a matching, valid recorded Jev run', () => {
  expect(results).toHaveLength(examples.length);
  for (const example of examples) {
    validateRequest(example.request);
    expect(Object.keys(example.request.questions).length).toBe(1);
    const matches = results.filter(run => JSON.stringify(run.request) === JSON.stringify(example.request));
    expect(matches).toHaveLength(1);
    const [run] = matches;
    expect(Number.isFinite(Date.parse(run.recordedAt))).toBe(true);
    expect(validateJevResponse(example.request, run.jev)).toEqual(run.jev);
  }
});

test('saved comparisons work without a key and respect the off preference', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  expect(comparisonEnabled(storage)).toBe(false);
  expect(comparisonEnabled(storage, true)).toBe(true);
  setComparisonEnabled(false, storage);
  expect(comparisonEnabled(storage, true)).toBe(false);
});

test('match feedback compares human answers against the recorded Jev answers', () => {
  for (const run of results) for (const [id, jev] of Object.entries(run.jev.answers)) {
    expect(matchesJev(jev, jev)).toBe(true);
    const question = run.request.questions[id];
    const different = jev.type === 'choice'
      ? { type: 'choice', choice: Object.keys(question.criteria).find(key => key !== jev.choice) }
      : jev.type === 'noul' ? { type: 'noul', noul: jev.noul >= 0.5 ? 0 : 1 }
      : { type: 'score', score: Math.round(jev.score) === 0 ? question.criteria.length - 1 : 0 };
    expect(matchesJev(different, jev)).toBe(false);
  }
});
