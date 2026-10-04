import { expect, test } from 'bun:test';
import { examples } from './public/examples.js';
import results from './public/example-results.json';
import { validateRequest } from './public/protocol.js';
import { validateJevResponse, matchesJev, jevCost, hourlyPay, slowdown, jevSeconds } from './public/compare.js';

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

test('hourly pay is the Jev cost of the request over the time spent', () => {
  const request = { model: 'jev-latest', state: 'x'.repeat(373), questions: {} };
  // {"state":"xxx…","questions":{}} is 400 characters, so 100 tokens.
  expect(jevCost(request)).toBeCloseTo(100 * 0.042 / 1e6, 15);
  expect(hourlyPay(request, 10)).toBe('Hourly Pay: $0.0015/hr');
  expect(hourlyPay(request, 0)).toBe('Hourly Pay: $0.15/hr');
});

test('slowdown compares answer time with the measured Jev round trip', () => {
  expect(slowdown(jevSeconds * 125)).toBe('125x Slower');
  expect(slowdown(jevSeconds * 1500)).toBe('1,500x Slower');
  expect(slowdown(0)).toBe('1x Slower');
});
