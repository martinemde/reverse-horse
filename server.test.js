import { afterEach, expect, test } from 'bun:test';
import { startServer } from './server.js';
import { buildRequest } from './public/builder-data.js';

const resources = [];
afterEach(async () => { for (const close of resources.reverse()) await close(); resources.length = 0; });
function app(options = {}) {
  const running = startServer({ port: 0, ...options });
  resources.push(() => running.stop());
  return running.server.url;
}
function connect(base, { active = true } = {}) {
  const ws = new WebSocket(new URL('/ws', base).href.replace('http:', 'ws:'), { headers: { Origin: base.origin } });
  const messages = [];
  const waiters = new Set();
  let registered;
  const ready = new Promise(resolve => { registered = resolve; });
  ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'presence', active })));
  ws.addEventListener('message', event => { if (JSON.parse(event.data).type === 'presence') registered(); });
  ws.addEventListener('message', event => { const message = JSON.parse(event.data); messages.push(message); for (const waiter of [...waiters]) waiter(); });
  resources.push(() => ws.close());
  async function next(predicate) {
    await ready;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(check); reject(new Error('WebSocket message timed out')); }, 2000);
      function check() {
        const index = messages.findIndex(predicate);
        if (index !== -1) { clearTimeout(timer); waiters.delete(check); resolve(messages.splice(index, 1)[0]); }
      }
      waiters.add(check); check();
    });
  }
  return { ws, next, send: message => ws.send(JSON.stringify(message)) };
}
const request = {
  model: 'jev-latest', state: { message: 'Please help with a refund' },
  questions: {
    urgent: { type: 'noul', instructions: { question: 'Is this urgent?' }, criteria: { true: 'Urgent', false: 'Not urgent' } },
    department: { type: 'choice', instructions: 'Which team?', criteria: { billing: null, support: ['Technical support'] } },
    mood: { type: 'score', instructions: 'How happy?', criteria: ['Sad', 'Neutral', { label: 'Happy' }] },
  },
};
function post(base, body = request, path = '/v1/systemone') {
  return fetch(new URL(path, base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('averages all live UI replies and keeps the caller waiting after the first', async () => {
  const base = app(); const first = connect(base); const second = connect(base);
  await first.next(m => m.type === 'queue'); await second.next(m => m.type === 'queue');
  const response = post(base);
  const item = (await first.next(m => m.requests?.length === 1)).requests[0];
  await second.next(m => m.requests?.length === 1);
  first.send({ type: 'submit', id: item.id, values: { urgent: 0.25, department: { billing: 0.5, support: 0 }, mood: 0 } });
  const waiting = await first.next(m => m.type === 'queue');
  expect(waiting.requests).toHaveLength(1);
  expect(waiting.requests[0].received).toBe(1);
  expect(waiting.requests[0].expected).toBe(2);
  first.send({ type: 'submit', id: item.id, values: { urgent: 1, department: { billing: 0, support: 1 }, mood: 2 } });
  expect((await first.next(m => m.type === 'error')).message).toBe('You already answered this request');
  second.send({ type: 'submit', id: item.id, values: { urgent: 0.75, department: { billing: 0, support: 1 }, mood: 2 } });
  const result = await (await response).json();
  expect(result.answers.urgent).toEqual({ type: 'noul', noul: 0.5 });
  expect(result.answers.department).toEqual({ type: 'choice', choice: 'billing', probabilities: { billing: 0.5, support: 0.5 }, confidence: 0.75 });
  expect(result.answers.mood).toEqual({ type: 'score', score: 1, legend: { 0: 'Sad', 1: 'Neutral', 2: { label: 'Happy' } }, probabilities: { 0: 0.5, 1: 0, 2: 0.5 }, confidence: 1 });
  const completed = await second.next(m => m.results?.[0]?.human);
  expect(completed.requests).toEqual([]);
  expect(completed.results[0].human).toEqual(result);
  expect(completed.results[0].answerCount).toBe(2);
});

test('only visible UIs participate, and newly visible UIs join pending requests', async () => {
  const base = app(); const first = connect(base); const hidden = connect(base, { active: false });
  await first.next(m => m.type === 'queue'); await hidden.next(m => m.type === 'queue');
  const response = post(base);
  const item = (await first.next(m => m.requests?.length)).requests[0];
  expect(item.expected).toBe(1);
  hidden.send({ type: 'submit', id: item.id, values: { urgent: 1, department: { billing: 1, support: 0 }, mood: 2 } });
  expect((await hidden.next(m => m.type === 'error')).message).toBe('The answering screen must be visible');
  hidden.send({ type: 'presence', active: true });
  await first.next(m => m.requests?.[0]?.expected === 2);
  first.send({ type: 'submit', id: item.id, values: { urgent: 0.25, department: { billing: 1, support: 0 }, mood: 1 } });
  await first.next(m => m.requests?.[0]?.received === 1);
  hidden.send({ type: 'presence', active: false });
  expect((await (await response).json()).answers.urgent.noul).toBe(0.25);
});

test('disconnecting an unanswered UI releases the remaining replies', async () => {
  const base = app(); const first = connect(base); const second = connect(base);
  await first.next(m => m.type === 'queue'); await second.next(m => m.type === 'queue');
  const response = post(base);
  const item = (await first.next(m => m.requests?.length)).requests[0];
  first.send({ type: 'submit', id: item.id, values: { urgent: 0.75, department: { billing: 1, support: 0 }, mood: 1 } });
  await first.next(m => m.requests?.[0]?.received === 1);
  second.ws.close();
  expect((await (await response).json()).answers.urgent.noul).toBe(0.75);
});

test('saved replies count after disconnect and the deadline averages available answers', async () => {
  const base = app({ timeoutMs: 100 }); const first = connect(base); const second = connect(base); const unanswered = connect(base);
  await Promise.all([first.next(m => m.type === 'queue'), second.next(m => m.type === 'queue'), unanswered.next(m => m.type === 'queue')]);
  const response = post(base);
  const item = (await first.next(m => m.requests?.length)).requests[0];
  first.send({ type: 'submit', id: item.id, values: { urgent: 0, department: { billing: 1, support: 0 }, mood: 0 } });
  await first.next(m => m.requests?.[0]?.received === 1);
  first.ws.close();
  second.send({ type: 'submit', id: item.id, values: { urgent: 1, department: { billing: 0, support: 1 }, mood: 2 } });
  await second.next(m => m.requests?.[0]?.received === 2);
  const result = await response;
  expect(result.status).toBe(200);
  expect((await result.json()).answers.urgent.noul).toBe(0.5);
  const completed = await unanswered.next(m => m.results?.[0]?.human);
  expect(completed.results[0].answerCount).toBe(2);
  expect(completed.results[0].late).toBe(false);
});

test('holds the API connection, accepts all primitives, and skips Jev without credentials', async () => {
  const base = app(); const client = connect(base);
  expect((await client.next(m => m.type === 'queue')).requests).toEqual([]);
  let settled = false;
  const response = post(base).then(r => { settled = true; return r; });
  const queued = await client.next(m => m.requests?.length === 1);
  const item = queued.requests[0];
  expect(item.request).toEqual(request);
  expect(item.deadline - item.createdAt).toBe(30_000);
  expect(settled).toBe(false);
  const reconnected = connect(base, { active: false });
  expect((await reconnected.next(m => m.requests?.length === 1)).requests[0].id).toBe(item.id);
  client.send({ type: 'submit', id: item.id, values: { urgent: 0.85, department: { billing: 0.75, support: 0.25 }, mood: 1.25 } });
  const result = await (await response).json();
  expect(result.model).toBe('reverse-horse');
  expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  expect(result.answers.urgent).toEqual({ type: 'noul', noul: 0.85 });
  expect(result.answers.department.choice).toBe('billing');
  expect(result.answers.department.probabilities).toEqual({ billing: 0.75, support: 0.25 });
  expect(result.answers.mood.score).toBe(1.25);
  expect(result.answers.mood.probabilities).toEqual({ 0: 0, 1: 0.75, 2: 0.25 });
  expect(result.answers.mood.legend).toEqual({ 0: 'Sad', 1: 'Neutral', 2: { label: 'Happy' } });
  expect(result.answers.department.confidence).toBe(0.75);
  // The first completion snapshot must contain the result; an empty snapshot
  // would remove the original browser card before the result arrives.
  const completed = await client.next(m => m.type === 'queue');
  expect(completed.results[0]?.human).toBeDefined();
  expect(completed.results[0].status).toBe('Answered · comparison off');
  expect(completed.results[0].jev).toBeUndefined();
  expect(completed.requests).toEqual([]);
  reconnected.send({ type: 'submit', id: item.id, values: {} });
  expect((await reconnected.next(m => m.type === 'error')).message).toBe('This request is no longer waiting');
});

test('choice normalizes independent bar weights and returns tallest-bar confidence', async () => {
  const base = app(); const client = connect(base);
  await client.next(m => m.type === 'queue');
  const body = { model: 'jev-latest', state: 'Pick an option', questions: {
    pick: { type: 'choice', instructions: 'Which option?', criteria: { a: null, b: null, c: null } },
  } };
  for (const [weights, confidence, probabilities] of [
    [[1, 0, 0], 1, [1, 0, 0]],
    [[1, 1, 0], 1, [0.5, 0.5, 0]],
    [[0.5, 0.5, 0], 0.5, [0.5, 0.5, 0]],
    [[0.5, 0, 0], 0.5, [1, 0, 0]],
    [[0.01, 0, 0], 0.01, [1, 0, 0]],
  ]) {
    const response = post(base, body);
    const item = (await client.next(m => m.requests?.length === 1)).requests[0];
    client.send({ type: 'submit', id: item.id, values: { pick: { a: weights[0], b: weights[1], c: weights[2] } } });
    const result = await response;
    expect(result.status).toBe(200);
    expect((await result.json()).answers.pick).toEqual({
      type: 'choice', choice: 'a', confidence,
      probabilities: { a: probabilities[0], b: probabilities[1], c: probabilities[2] },
    });
  }
});

test('expires the API call but retains questions for late answers and comparison', async () => {
  const base = app({ timeoutMs: 100 }); const client = connect(base);
  await client.next(m => m.type === 'queue');
  const response = post(base, request, '/api/v1/systemone');
  const item = (await client.next(m => m.requests?.length)).requests[0];
  expect((await response).status).toBe(504);
  const expired = await client.next(m => m.requests?.[0]?.timedOut);
  expect(expired.requests[0].id).toBe(item.id);
  const reconnected = connect(base, { active: false });
  expect((await reconnected.next(m => m.requests?.[0]?.timedOut)).requests[0].request).toEqual(request);
  client.send({ type: 'submit', id: item.id, compare: true, values: { urgent: 0.75, department: { billing: 1, support: 0 }, mood: 1.5 } });
  const completed = await client.next(m => m.results?.[0]?.human);
  expect(completed.requests).toEqual([]);
  expect(completed.results[0].late).toBe(true);
  expect(completed.results[0].human.answers.mood.score).toBe(1.5);
  expect((await client.next(m => m.type === 'compare')).id).toBe(item.id);
  client.send({ type: 'comparison', id: item.id, error: 'Comparison skipped in local test' });
  reconnected.send({ type: 'submit', id: item.id, values: {} });
  expect((await reconnected.next(m => m.type === 'error')).message).toBe('This request is no longer waiting');
});

test('invalid requests and invalid answers do not consume a waiting request', async () => {
  const base = app(); const client = connect(base);
  await client.next(m => m.type === 'queue');
  for (const body of [{}, { ...request, questions: {} }, { ...request, questions: { x: { type: 'score', instructions: 'Rating?', criteria: ['One'] } } }]) expect((await post(base, body)).status).toBe(400);
  const response = post(base);
  const item = (await client.next(m => m.requests?.length)).requests[0];
  client.send({ type: 'submit', id: item.id, values: { urgent: 0, department: { billing: 0, support: 0 }, mood: 1 } });
  expect((await client.next(m => m.type === 'error')).message).toBe('department: at least one option needs a positive weight');
  client.send({ type: 'submit', id: item.id, values: { urgent: 0, department: { billing: 1, support: 0 }, mood: 2 } });
  expect((await response).status).toBe(200);
});

test('practice is not controlled through the shared websocket', async () => {
  const base = app(); const client = connect(base);
  const queue = await client.next(m => m.type === 'queue');
  expect(queue.requests).toHaveLength(0);
  expect(queue.auto).toBeUndefined();
  client.send({ type: 'auto', enabled: true });
  expect((await client.next(m => m.type === 'error')).message).toBe('Unknown message type');
});

test('serves the page and assets and blocks cross-origin requests', async () => {
  const base = app();
  for (const path of ['/', '/request', '/help', '/about', '/builder.js', '/builder-data.js', '/auth/openrouter/callback?code=example', '/app.js', '/training.js', '/examples.js', '/example-results.json', '/protocol.js', '/auth.js', '/compare.js', '/style.css']) expect((await fetch(new URL(path, base))).status).toBe(200);
  expect((await fetch(new URL('/ws', base), { headers: { Origin: 'https://elsewhere.example' } })).status).toBe(403);
  expect((await fetch(new URL('/v1/systemone', base), { method: 'POST', headers: { Origin: 'https://elsewhere.example', 'Content-Type': 'application/json' }, body: JSON.stringify(request) })).status).toBe(403);
});

test('one opted-in browser compares the aggregate after answering the caller', async () => {
  const base = app(); const client = connect(base); const observer = connect(base);
  await client.next(m => m.type === 'queue'); await observer.next(m => m.type === 'queue');
  const response = post(base);
  const item = (await client.next(m => m.requests?.length)).requests[0];
  client.send({ type: 'submit', id: item.id, compare: true, values: { urgent: 1, department: { billing: 1, support: 0 }, mood: 1 } });
  await client.next(m => m.requests?.[0]?.received === 1);
  observer.send({ type: 'submit', id: item.id, compare: false, values: { urgent: 0, department: { billing: 0, support: 1 }, mood: 1 } });
  expect((await response).status).toBe(200);
  const comparison = await client.next(m => m.type === 'compare');
  expect(comparison).toEqual({ type: 'compare', id: item.id, request });
  observer.send({ type: 'comparison', id: item.id, error: 'Must not overwrite another browser’s result' });
  expect((await observer.next(m => m.type === 'error')).message).toBe('This comparison is no longer waiting');
  client.send({ type: 'comparison', id: item.id, error: 'Comparison stopped or timed out' });
  const finished = await client.next(m => m.results?.[0]?.status === 'Comparison stopped or timed out');
  expect(finished.results[0].human.answers.urgent.noul).toBe(0.5);
  expect(finished.results[0].jev).toBeUndefined();
});

test('concurrent requests remain isolated and disconnecting a caller removes its request', async () => {
  const base = app(); const client = connect(base);
  await client.next(m => m.type === 'queue');
  const controller = new AbortController();
  const abandoned = fetch(new URL('/v1/systemone', base), { method: 'POST', body: JSON.stringify({ ...request, state: 'Abandoned' }), signal: controller.signal }).catch(e => e.name);
  const first = (await client.next(m => m.requests?.length === 1)).requests[0];
  const response = post(base, { ...request, state: 'Still waiting' });
  const both = await client.next(m => m.requests?.length === 2);
  const second = both.requests.find(r => r.id !== first.id);
  controller.abort();
  expect(await abandoned).toBe('AbortError');
  const remaining = await client.next(m => m.requests?.length === 1 && m.requests[0].id === second.id);
  expect(remaining.requests[0].request.state).toBe('Still waiting');
  client.send({ type: 'submit', id: second.id, values: { urgent: 1, department: { billing: 0, support: 1 }, mood: 0 } });
  expect((await (await response).json()).answers.department.choice).toBe('support');
});

test('a request built from form fields travels through the API and returns all three answers', async () => {
  const base = app(); const client = connect(base);
  await client.next(m => m.type === 'queue');
  const built = buildRequest({ state: '{"message":"The delivery was late but intact."}', stateFormat: 'json', questions: [
    { id: 'damaged', type: 'noul', instructions: 'Was it damaged?', no: 'Intact', yes: 'Damaged' },
    { id: 'topic', type: 'choice', instructions: 'What is it about?', options: [{ key: 'shipping', description: 'Delivery' }, { key: 'billing', description: '' }] },
    { id: 'mood', type: 'score', instructions: 'How happy?', levels: ['Sad', 'Mixed', 'Happy'] },
  ] });
  const response = post(base, built);
  const item = (await client.next(m => m.requests?.length)).requests[0];
  expect(item.request.state).toEqual({ message: 'The delivery was late but intact.' });
  expect(item.request.questions.topic.criteria).toEqual({ shipping: 'Delivery', billing: null });
  client.send({ type: 'submit', id: item.id, values: { damaged: 0, topic: { shipping: 1, billing: 0 }, mood: 1.2 } });
  const result = await (await response).json();
  expect(result.answers.damaged.noul).toBe(0);
  expect(result.answers.topic.choice).toBe('shipping');
  expect(result.answers.mood.score).toBe(1.2);
});

test('builder rejects malformed JSON, duplicate IDs and incomplete criteria before sending', () => {
  const q = { id: 'q', type: 'noul', instructions: 'Question?' };
  expect(() => buildRequest({ state: '{', stateFormat: 'json', questions: [q] })).toThrow('State must be valid JSON');
  expect(() => buildRequest({ state: 'text', questions: [q, q] })).toThrow('used more than once');
  expect(() => buildRequest({ state: 'text', questions: [{ ...q, type: 'choice', options: [{ key: 'a', description: '' }, { key: 'a', description: '' }] }] })).toThrow('unique key');
  expect(() => buildRequest({ state: 'text', questions: [{ ...q, type: 'score', levels: ['Only one'] }] })).toThrow('2–10');
});
