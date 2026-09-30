import { validateRequest, answerRequest } from './protocol.js';
import { examples } from './examples.js';

export function startServer({ port = Number(process.env.PORT || 3000), hostname = '127.0.0.1', timeoutMs = 30_000, apiKey = process.env.TYPESAFE_API_KEY } = {}) {
  const pending = new Map();
  const clients = new Set();
  const results = [];
  const comparisons = new Set();
  let auto = false;
  let autoTimer;
  let exampleIndex = Math.floor(Math.random() * examples.length);
  const json = (body, status = 200) => Response.json(body, { status });
  const error = (message, status) => json({ error: { message } }, status);
  const snapshot = () => JSON.stringify({ type: 'queue', serverTime: Date.now(), auto, configured: Boolean(apiKey), results, requests: [...pending.values()].map(({ id, request, createdAt, deadline, source, title }) => ({ id, request, createdAt, deadline, source, title })) });
  const broadcast = () => { const message = snapshot(); for (const ws of clients) ws.send(message); };
  function scheduleExample() {
    clearTimeout(autoTimer);
    if (auto && clients.size && !pending.size && !comparisons.size) autoTimer = setTimeout(() => {
      if (!auto || !clients.size || pending.size || comparisons.size) return;
      const example = examples[exampleIndex++ % examples.length];
      enqueue(example.request, () => {}, undefined, example);
    }, 4000);
  }
  function enqueue(request, resolve, signal, example) {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const finish = (response, outcome) => {
      const entry = pending.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      signal?.removeEventListener('abort', abort);
      pending.delete(id);
      if (outcome) {
        results.unshift({ id, request, title: entry.title, source: entry.source, status: outcome });
        results.splice(20);
      }
      resolve(response);
      broadcast();
      scheduleExample();
    };
    const abort = () => finish(error('Caller disconnected', 499), 'Caller disconnected');
    const timer = setTimeout(() => finish(error('Timed out waiting for a human answer', 504), 'Time’s up'), timeoutMs);
    pending.set(id, { id, request, createdAt, deadline: createdAt + timeoutMs, title: example?.title || 'API request', source: example?.source, timer, finish });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else broadcast();
  }
  async function compare(entry, human) {
    const result = { id: entry.id, request: entry.request, title: entry.title, source: entry.source, human, status: apiKey ? 'Asking JEV…' : 'Set TYPESAFE_API_KEY to compare with JEV' };
    results.unshift(result);
    results.splice(20);
    broadcast();
    if (!apiKey) { scheduleExample(); return; }
    const controller = new AbortController();
    comparisons.add(controller);
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(entry.request), signal: controller.signal });
      if (!response.ok) throw new Error(`JEV returned HTTP ${response.status}`);
      const jev = await response.json();
      if (!jev.answers || !Object.entries(entry.request.questions).every(([id, q]) => {
        const answer = jev.answers[id];
        if (!answer || answer.type !== q.type) return false;
        if (q.type === 'noul') return Number.isFinite(answer.noul) && answer.noul >= 0 && answer.noul <= 1;
        return answer.probabilities && Number.isFinite(answer.confidence) && (q.type === 'choice' ? Object.hasOwn(q.criteria, answer.choice) : Number.isFinite(answer.score));
      })) throw new Error('JEV returned an invalid answer');
      result.jev = jev;
      result.status = 'Compared';
    } catch (e) { result.status = `Comparison failed: ${e.name === 'AbortError' ? 'JEV timed out' : e.message}`; }
    finally { clearTimeout(timer); comparisons.delete(controller); broadcast(); scheduleExample(); }
  }
  const server = Bun.serve({
    hostname, port, idleTimeout: 0, maxRequestBodySize: 1024 * 1024,
    async fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === '/ws') {
        if (req.headers.get('origin') !== url.origin) return error('Origin not allowed', 403);
        return server.upgrade(req) ? undefined : error('WebSocket upgrade required', 400);
      }
      if (req.method === 'GET' && ['/', '/app.js', '/style.css'].includes(url.pathname)) {
        return new Response(Bun.file(new URL(`./public/${url.pathname === '/' ? 'index.html' : url.pathname.slice(1)}`, import.meta.url)), { headers: { 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'" } });
      }
      if (req.method !== 'POST' || !['/api/v1/systemone', '/v1/systemone'].includes(url.pathname)) return error('Not found', 404);
      const origin = req.headers.get('origin');
      if (origin && origin !== url.origin) return error('Origin not allowed', 403);
      let request;
      try { request = validateRequest(await req.json()); }
      catch (e) { return error(e.message, 400); }
      if (pending.size >= 100) return error('Queue is full', 503);
      return new Promise(resolve => enqueue(request, resolve, req.signal));
    },
    websocket: {
      idleTimeout: 60,
      open(ws) { clients.add(ws); ws.send(snapshot()); scheduleExample(); },
      close(ws) { clients.delete(ws); scheduleExample(); },
      message(ws, raw) {
        try {
          const message = JSON.parse(String(raw));
          if (message.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }
          if (message.type === 'auto') {
            if (typeof message.enabled !== 'boolean') throw new Error('Invalid auto setting');
            auto = message.enabled;
            broadcast();
            if (auto && !pending.size && !comparisons.size) {
              const example = examples[exampleIndex++ % examples.length];
              enqueue(example.request, () => {}, undefined, example);
            } else scheduleExample();
            return;
          }
          if (message.type !== 'submit') throw new Error('Unknown message type');
          const entry = pending.get(message.id);
          if (!entry) throw new Error('This request is no longer waiting');
          if (Date.now() >= entry.deadline) { entry.finish(error('Timed out waiting for a human answer', 504), 'Time’s up'); throw new Error('Time’s up'); }
          const response = answerRequest(entry.request, message.values);
          ws.send(JSON.stringify({ type: 'submitted', id: message.id }));
          entry.finish(json(response));
          void compare(entry, response);
        } catch (e) { ws.send(JSON.stringify({ type: 'error', message: e.message })); }
      },
    },
  });
  return { server, async stop() { auto = false; clearTimeout(autoTimer); for (const controller of comparisons) controller.abort(); for (const entry of [...pending.values()]) entry.finish(error('Server stopped', 503)); await server.stop(true); } };
}

if (import.meta.main) {
  const app = startServer();
  console.log(`meat-jev listening at ${app.server.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.stop(); process.exit(0); });
}
