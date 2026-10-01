const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const description = value => typeof value === 'string' || (value !== null && typeof value === 'object');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function validateRequest(body) {
  assert(object(body), 'Request must be an object');
  assert(description(body.state), 'state must be a string, object, or array');
  assert(typeof body.model === 'string' && body.model.length > 0, 'model is required');
  assert(object(body.questions) && Object.keys(body.questions).length > 0, 'questions must be a nonempty map');
  for (const [id, q] of Object.entries(body.questions)) {
    assert(object(q) && description(q.instructions), `${id}: instructions must be a string, object, or array`);
    assert(['noul', 'choice', 'score'].includes(q.type), `${id}: unknown question type`);
    if (q.type === 'choice') {
      assert(object(q.criteria), `${id}: choice criteria must be a map`);
      const options = Object.values(q.criteria);
      assert(options.length > 0 && options.length <= 255 && options.every(v => v === null || description(v)), `${id}: choice requires 1–255 options`);
    } else if (q.type === 'score') {
      assert(Array.isArray(q.criteria) && q.criteria.length >= 2 && q.criteria.length <= 10 && q.criteria.every(description), `${id}: score requires 2–10 levels`);
    } else if (q.criteria !== undefined) {
      assert(object(q.criteria) && Object.entries(q.criteria).every(([key, value]) => ['true', 'false'].includes(key) && description(value)), `${id}: noul criteria accepts true and false descriptions`);
    }
  }
  return body;
}

// TypeSafe does not publish its confidence formula. Use normalized entropy.
function confidence(probabilities) {
  const p = Object.values(probabilities);
  if (p.length === 1) return 1;
  return Math.max(0, Math.min(1, 1 + p.reduce((sum, n) => sum + (n ? n * Math.log(n) : 0), 0) / Math.log(p.length)));
}

export function answerRequest(request, values) {
  assert(object(values) && Object.keys(values).length === Object.keys(request.questions).length, 'Answer every question');
  const answers = Object.fromEntries(Object.entries(request.questions).map(([id, q]) => {
    assert(Object.hasOwn(values, id), `Missing answer: ${id}`);
    const value = values[id];
    if (q.type === 'choice') {
      const keys = Object.keys(q.criteria);
      assert(object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key) && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1), `${id}: invalid choice weights`);
      const total = keys.reduce((sum, key) => sum + value[key], 0);
      assert(total > 0, `${id}: at least one option needs a positive weight`);
      const probabilities = Object.fromEntries(keys.map(key => [key, value[key] / total]));
      const choice = keys.reduce((best, key) => probabilities[key] > probabilities[best] ? key : best);
      return [id, { type: q.type, choice, probabilities, confidence: confidence(probabilities) }];
    }
    const max = q.type === 'noul' ? 1 : q.criteria.length - 1;
    assert(Number.isFinite(value) && value >= 0 && value <= max, `${id}: answer must be between 0 and ${max}`);
    if (q.type === 'noul') return [id, { type: 'noul', noul: value }];
    const probabilities = Object.fromEntries(q.criteria.map((_, index) => [index, Math.max(0, 1 - Math.abs(index - value))]));
    return [id, { type: 'score', score: value, legend: Object.fromEntries(q.criteria.map((label, index) => [index, label])), probabilities, confidence: confidence(probabilities) }];
  }));
  return { model: 'reverse-horse', answers, usage: { input_tokens: 0, output_tokens: 0 } };
}
