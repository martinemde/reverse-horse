export function validateJevResponse(request, jev) {
  if (!jev?.answers) throw new Error('JEV returned an invalid answer');
  const answers = Object.fromEntries(Object.entries(request.questions).map(([id, q]) => {
    const answer = jev.answers[id];
    const probability = n => Number.isFinite(n) && n >= 0 && n <= 1;
    const invalid = () => { throw new Error('JEV returned an invalid answer'); };
    if (!answer || answer.type !== q.type) invalid();
    if (q.type === 'noul') {
      if (!probability(answer.noul)) invalid();
      return [id, { type: 'noul', noul: answer.noul }];
    }
    const keys = Object.keys(q.criteria);
    if (!probability(answer.confidence) || !answer.probabilities || !keys.every(key => probability(answer.probabilities[key]))) invalid();
    const probabilities = Object.fromEntries(keys.map(key => [key, answer.probabilities[key]]));
    if (Math.abs(Object.values(probabilities).reduce((a, b) => a + b, 0) - 1) > 0.01) invalid();
    const common = { type: q.type, confidence: answer.confidence, probabilities };
    if (q.type === 'choice') {
      if (!Object.hasOwn(q.criteria, answer.choice)) invalid();
      return [id, { ...common, choice: answer.choice }];
    }
    if (!Number.isFinite(answer.score) || answer.score < 0 || answer.score > keys.length - 1) invalid();
    return [id, { ...common, score: answer.score, legend: Object.fromEntries(q.criteria.map((label, i) => [i, label])) }];
  }));
  return { model: typeof jev.model === 'string' ? jev.model : request.model, answers };
}

export async function compareWithJev(request, apiKey, signal) {
  if (!apiKey) return { error: 'Comparison skipped · OpenRouter not connected' };
  const response = await fetch('https://openrouter.ai/api/v1/systemone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'X-OpenRouter-Title': 'Meat Jev' },
    body: JSON.stringify(request), signal,
  });
  if (!response.ok) throw new Error(`OpenRouter returned HTTP ${response.status}${response.status === 401 ? ' · reconnect your account' : response.status === 402 ? ' · check your OpenRouter credits' : ''}`);
  return { jev: validateJevResponse(request, await response.json()) };
}

export function matchesJev(human, jev) {
  if (human.type !== jev.type) return false;
  if (human.type === 'choice') return human.choice === jev.choice;
  if (human.type === 'noul') return (human.noul >= 0.5) === (jev.noul >= 0.5);
  return Math.round(human.score) === Math.round(jev.score);
}
