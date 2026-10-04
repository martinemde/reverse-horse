const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const description = value => typeof value === 'string' || (value !== null && typeof value === 'object');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
// Humans answer in 30 seconds, so requests stay small. The largest built-in
// example is 802 bytes pretty-printed; three times that, rounded down.
export const requestLimits = Object.freeze({ questions: 3, bytes: 2400 });

export function validateRequest(body) {
  assert(object(body), 'Request must be an object');
  assert(description(body.state), 'state must be a string, object, or array');
  assert(typeof body.model === 'string' && body.model.length > 0, 'model is required');
  assert(object(body.questions) && Object.keys(body.questions).length > 0, 'questions must be a nonempty map');
  assert(Object.keys(body.questions).length <= requestLimits.questions, `At most ${requestLimits.questions} questions are allowed`);
  // JSON.parse accepts nesting that JSON.stringify and browser rendering cannot.
  const stack = [[body, 0]];
  let nodes = 1;
  while (stack.length) {
    const [value, depth] = stack.pop();
    assert(depth <= 16, 'Request nesting exceeds 16 levels');
    if (value && typeof value === 'object') for (const child of Object.values(value)) {
      assert(++nodes <= 2048, 'Request complexity exceeds 2048 values');
      stack.push([child, depth + 1]);
    }
  }
  let controls = 0;
  for (const [id, q] of Object.entries(body.questions)) {
    assert(id.length <= 64, 'Question IDs must be at most 64 characters');
    assert(object(q) && description(q.instructions), `${id}: instructions must be a string, object, or array`);
    assert(['noul', 'choice', 'score'].includes(q.type), `${id}: unknown question type`);
    if (q.type === 'choice') {
      assert(object(q.criteria), `${id}: choice criteria must be a map`);
      const options = Object.values(q.criteria);
      assert(options.length > 0 && options.length <= 255 && options.every(v => v === null || description(v)), `${id}: choice requires 1–255 options`);
      assert(Object.keys(q.criteria).every(key => key.length <= 64), `${id}: option IDs must be at most 64 characters`);
      controls += options.length;
    } else if (q.type === 'score') {
      assert(Array.isArray(q.criteria) && q.criteria.length >= 2 && q.criteria.length <= 10 && q.criteria.every(description), `${id}: score requires 2–10 levels`);
      controls += q.criteria.length;
    } else if (q.criteria !== undefined) {
      assert(object(q.criteria) && Object.entries(q.criteria).every(([key, value]) => ['true', 'false'].includes(key) && description(value)), `${id}: noul criteria accepts true and false descriptions`);
    }
  }
  assert(controls <= 512, 'At most 512 choice options and score levels are allowed');
  return body;
}

// TypeSafe does not publish its confidence formula. Use normalized entropy.
function confidence(probabilities) {
  const p = Object.values(probabilities);
  if (p.length === 1) return 1;
  return Math.max(0, Math.min(1, 1 + p.reduce((sum, n) => sum + (n ? n * Math.log(n) : 0), 0) / Math.log(p.length)));
}

// Recover bar fullness from a normalized distribution and its tallest bar.
export function choiceWeights(answer) {
  const max = Math.max(...Object.values(answer.probabilities));
  return Object.fromEntries(Object.entries(answer.probabilities).map(([key, probability]) => [key, max ? probability / max * answer.confidence : 0]));
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
      return [id, { type: q.type, choice, probabilities, confidence: Math.max(...keys.map(key => value[key])) }];
    }
    const max = q.type === 'noul' ? 1 : q.criteria.length - 1;
    assert(Number.isFinite(value) && value >= 0 && value <= max, `${id}: answer must be between 0 and ${max}`);
    if (q.type === 'noul') return [id, { type: 'noul', noul: value }];
    const probabilities = Object.fromEntries(q.criteria.map((_, index) => [index, Math.max(0, 1 - Math.abs(index - value))]));
    return [id, { type: 'score', score: value, legend: Object.fromEntries(q.criteria.map((label, index) => [index, label])), probabilities, confidence: confidence(probabilities) }];
  }));
  return { model: 'reverse-horse', answers, usage: { input_tokens: 0, output_tokens: 0 } };
}

// Every respondent has equal weight, regardless of how full their Choice bars are.
export function averageResponses(responses) {
  assert(responses.length > 0, 'At least one answer is required');
  if (responses.length === 1) return responses[0];
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const answers = Object.fromEntries(Object.entries(responses[0].answers).map(([id, first]) => {
    const replies = responses.map(response => response.answers[id]);
    if (first.type === 'noul') return [id, { type: 'noul', noul: mean(replies.map(answer => answer.noul)) }];
    const probabilities = Object.fromEntries(Object.keys(first.probabilities).map(key => [key, mean(replies.map(answer => answer.probabilities[key]))]));
    const answer = { ...first, probabilities, confidence: mean(replies.map(answer => answer.confidence)) };
    if (first.type === 'score') answer.score = mean(replies.map(answer => answer.score));
    else answer.choice = Object.keys(probabilities).reduce((best, key) => probabilities[key] > probabilities[best] ? key : best);
    return [id, answer];
  }));
  return { ...responses[0], answers };
}
