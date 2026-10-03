import assert from 'node:assert/strict';
import { buildRequest } from '../public/builder-data.js';

const base = new URL(process.argv[2] || 'http://127.0.0.1:8787');
const sockets = [];
const abort = new AbortController();
function connect() {
  const ws = new WebSocket(new URL('/ws', base).href.replace(/^http/, 'ws'), { headers: { Origin: base.origin } });
  sockets.push(ws);
  ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'presence', active: true })));
  const messages = [];
  const waiters = new Set();
  ws.addEventListener('message', event => { messages.push(JSON.parse(event.data)); for (const check of [...waiters]) check(); });
  function next(predicate) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(check); reject(new Error('No expected WebSocket message within 40s')); }, 40_000);
      function check() {
        const index = messages.findIndex(predicate);
        if (index !== -1) { clearTimeout(timer); waiters.delete(check); resolve(messages.splice(index, 1)[0]); }
      }
      waiters.add(check); check();
    });
  }
  return { ws, next, send: message => ws.send(JSON.stringify(message)) };
}
const marker = `deployment-check-${crypto.randomUUID()}`;
const request = buildRequest({ state: marker, stateFormat: 'text', questions: [
  { id: 'yes', type: 'noul', instructions: 'Is this a deployment check?' },
  { id: 'route', type: 'choice', instructions: 'Where does this go?', options: [{ key: 'testing', description: '' }, { key: 'support', description: '' }] },
  { id: 'score', type: 'score', instructions: 'Rate progress.', levels: ['Starting', 'Working', 'Complete'] },
] });
const values = { yes: 1, route: { testing: 1, support: 0 }, score: 1.5 };
const post = state => fetch(new URL('/v1/systemone', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, state }), signal: abort.signal });
try {
  for (const path of ['/', '/request', '/builder.js', '/builder-data.js', '/auth/openrouter/callback?code=check', '/app.js', '/auth.js', '/compare.js', '/style.css']) {
    const response = await fetch(new URL(path, base));
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    if (path === '/request') assert.match(await response.text(), /id="builder"/);
  }
  const first = connect(); const second = connect();
  await Promise.all([first.next(m => m.type === 'queue'), second.next(m => m.type === 'queue')]);
  await Promise.all([first.next(m => m.type === 'presence'), second.next(m => m.type === 'presence')]);
  const response = post(marker);
  const pending = await first.next(m => m.requests?.some(r => r.request.state === marker));
  const item = pending.requests.find(r => r.request.state === marker);
  await second.next(m => m.requests?.some(r => r.id === item.id));
  first.send({ type: 'submit', id: item.id, values });
  await first.next(m => m.requests?.some(r => r.id === item.id && r.received === 1 && r.expected === 2));
  second.send({ type: 'submit', id: item.id, values: { yes: 0, route: { testing: 0, support: 1 }, score: 0.5 } });
  const answered = await response;
  assert.equal(answered.status, 200);
  const body = await answered.json();
  assert.equal(body.answers.yes.noul, 0.5);
  assert.equal(body.answers.route.choice, 'testing');
  assert.deepEqual(body.answers.route.probabilities, { testing: 0.5, support: 0.5 });
  assert.equal(body.answers.score.score, 1);
  second.send({ type: 'submit', id: item.id, values });
  assert.equal((await second.next(m => m.type === 'error')).message, 'This request is no longer waiting');
  console.log('PASS: assets, OAuth callback, two WebSockets, all primitives, averaged replies');

  const lateResponse = post(`${marker}-late`);
  const lateQueue = await first.next(m => m.requests?.some(r => r.request.state === `${marker}-late`));
  const late = lateQueue.requests.find(r => r.request.state === `${marker}-late`);
  console.log('Waiting for the real 30-second API deadline…');
  assert.equal((await lateResponse).status, 504);
  await first.next(m => m.requests?.some(r => r.id === late.id && r.timedOut));
  const reconnected = connect();
  await reconnected.next(m => m.type === 'presence');
  await reconnected.next(m => m.requests?.some(r => r.id === late.id && r.timedOut));
  first.ws.close(); second.ws.close();
  reconnected.send({ type: 'submit', id: late.id, values });
  const completed = await reconnected.next(m => m.results?.some(r => r.id === late.id && r.human));
  const result = completed.results.find(r => r.id === late.id);
  assert.equal(result.late, true);
  assert.equal(result.human.answers.score.score, 1.5);
  console.log('PASS: HTTP 504, retained questions, reconnect, late answer');
} finally { abort.abort(); for (const ws of sockets) ws.close(); }
